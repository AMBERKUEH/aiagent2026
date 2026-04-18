from pathlib import Path
import sys
from io import BytesIO
from typing import Optional, Tuple, List, Dict, Any

from fastapi import FastAPI
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
from PIL import Image
from pydantic import BaseModel

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

MODEL_PATH = Path(__file__).with_name("crop_yield_model.pkl")


class PredictionRequest(BaseModel):
    humidity: float
    light_intensity: float
    soil_moisture: float
    temperature: float
    water_level: Optional[float] = None
    waterLevel: Optional[float] = None


class CVPredictionRequest(BaseModel):
    image_path: Optional[str] = None
    image_base64: Optional[str] = None


def load_bundle() -> Dict[str, Any]:
    return joblib.load(MODEL_PATH)


bundle_cache: Optional[Dict[str, Any]] = None
bundle_error: Optional[Exception] = None


def get_bundle() -> dict:
    global bundle_cache, bundle_error

    if bundle_cache is not None:
        return bundle_cache
    if bundle_error is not None:
        raise RuntimeError(f"Yield model is unavailable: {bundle_error}") from bundle_error

    try:
        bundle_cache = load_bundle()
    except Exception as exc:
        bundle_error = exc
        raise RuntimeError(f"Yield model is unavailable: {exc}") from exc

    return bundle_cache


def get_model_runtime() -> Tuple[object, float, List[str]]:
    bundle = get_bundle()
    model = bundle["model"]
    test_r2 = float(bundle.get("test_r2", 0.4))
    feature_names = bundle.get(
        "feature_names",
        ["humidity", "light_intensity", "soil_moisture", "temperature", "water_level"],
    )
    return model, test_r2, feature_names

app = FastAPI(title="Smart Paddy Prediction API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> dict:
    try:
        _, test_r2, feature_names = get_model_runtime()
        yield_model_ready = True
        yield_model_error = None
    except RuntimeError as exc:
        test_r2 = 0.0
        feature_names = ["humidity", "light_intensity", "soil_moisture", "temperature", "water_level"]
        yield_model_ready = False
        yield_model_error = str(exc)

    return {
        "status": "ok",
        "yield_model_ready": yield_model_ready,
        "yield_model_error": yield_model_error,
        "test_r2": test_r2,
        "feature_names": feature_names,
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict:
    try:
        model, test_r2, feature_names = get_model_runtime()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    water_level = request.water_level if request.water_level is not None else request.waterLevel
    if water_level is None:
        raise HTTPException(status_code=422, detail="Missing water_level")

    feature_map = {
        "humidity": request.humidity,
        "light_intensity": request.light_intensity,
        "soil_moisture": request.soil_moisture,
        "temperature": request.temperature,
        "water_level": water_level,
    }
    try:
        frame = pd.DataFrame([[feature_map[name] for name in feature_names]], columns=feature_names)
        prediction = float(model.predict(frame)[0])
        confidence = round(max(40, min(95, test_r2 * 100)))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc

    return {
        "prediction": prediction,
        "confidence": confidence,
        "test_r2": test_r2,
        "features": feature_map,
    }


@app.get("/cv/health")
def cv_healthcheck() -> dict:
    from backend.cv.config import CURRENT_CONTRACT_PATH, CURRENT_MODEL_PATH, MODEL_NAME

    return {
        "status": "ok",
        "model_name": MODEL_NAME,
        "model_ready": CURRENT_MODEL_PATH.exists(),
        "contract_ready": CURRENT_CONTRACT_PATH.exists(),
    }


@app.get("/cv/spec")
def cv_spec() -> dict:
    from backend.cv.config import CONFIDENCE_THRESHOLD, DATASET_SOURCE, FALLBACK_LABEL, INPUT_SIZE, LABELS, MODEL_NAME

    return {
        "model_name": MODEL_NAME,
        "task": "image_classification",
        "input_size": {"width": INPUT_SIZE[0], "height": INPUT_SIZE[1], "channels": 3},
        "labels": LABELS,
        "fallback_label": FALLBACK_LABEL,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "dataset_source": DATASET_SOURCE,
    }


@app.post("/cv/predict")
def cv_predict(request: CVPredictionRequest) -> dict:
    try:
        from backend.cv.inference import (
            ModelNotReadyError,
            load_contract,
            load_image_from_request,
            predict_image,
        )

        image = load_image_from_request(request.image_path, request.image_base64)
        return predict_image(image)
    except ModelNotReadyError as exc:
        # Return a structured fallback so frontend scanner pages can still render a valid response.
        from importlib import import_module
        load_contract = import_module("backend.cv.inference").load_contract

        return {
            "predicted_label": "unknown",
            "confidence": 0.0,
            "top_predictions": [],
            "contract": load_contract(),
            "model_ready": False,
            "status": "model_not_ready",
            "message": str(exc),
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"CV prediction failed: {exc}") from exc


def _read_uploaded_image(image: Optional[UploadFile], file: Optional[UploadFile]) -> Image.Image:
    selected = image or file
    if selected is None:
        raise HTTPException(status_code=422, detail="Provide either 'image' or 'file' in multipart form-data.")

    try:
        content = selected.file.read()
        if not content:
            raise HTTPException(status_code=422, detail="Uploaded file is empty.")
        return Image.open(BytesIO(content))
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Unable to read uploaded image: {exc}") from exc


def _predict_from_uploaded_image(image: Optional[UploadFile], file: Optional[UploadFile]) -> Dict[str, Any]:
    try:
        from backend.cv.inference import ModelNotReadyError, load_contract, predict_image

        decoded_image = _read_uploaded_image(image=image, file=file)
        return predict_image(decoded_image)
    except ModelNotReadyError as exc:
        from importlib import import_module
        load_contract = import_module("backend.cv.inference").load_contract

        return {
            "predicted_label": "unknown",
            "confidence": 0.0,
            "top_predictions": [],
            "contract": load_contract(),
            "model_ready": False,
            "status": "model_not_ready",
            "message": str(exc),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"CV prediction failed: {exc}") from exc


@app.post("/scan")
def scan_image(image: Optional[UploadFile] = File(default=None), file: Optional[UploadFile] = File(default=None)) -> Dict[str, Any]:
    return _predict_from_uploaded_image(image=image, file=file)


@app.post("/predict-image")
def predict_image_alias(image: Optional[UploadFile] = File(default=None), file: Optional[UploadFile] = File(default=None)) -> Dict[str, Any]:
    return _predict_from_uploaded_image(image=image, file=file)


@app.post("/detect-disease")
def detect_disease_alias(image: Optional[UploadFile] = File(default=None), file: Optional[UploadFile] = File(default=None)) -> Dict[str, Any]:
    return _predict_from_uploaded_image(image=image, file=file)
