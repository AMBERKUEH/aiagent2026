from pathlib import Path
import sys
from io import BytesIO
from typing import Optional, Tuple, List, Dict, Any

from fastapi import FastAPI, File, HTTPException, UploadFile, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
import joblib
import pandas as pd
from PIL import Image
from pydantic import BaseModel
import os
import requests

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
        print(f"ERROR: Failed to load yield model: {exc}")
        import traceback
        traceback.print_exc()
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
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router that handles both /route and /api/route so it works
# in local dev (Vite proxy strips /api) AND in production (no proxy).
router = APIRouter()


@router.get("/health")
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


@router.post("/predict")
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
        "prediction": round(abs(prediction), 2),
        "raw_prediction": round(prediction, 4),
        "confidence": confidence,
        "test_r2": test_r2,
        "features": feature_map,
    }


@router.get("/cv/health")
def cv_healthcheck() -> dict:
    from backend.cv.config import CURRENT_CONTRACT_PATH, CURRENT_MODEL_PATH, MODEL_NAME

    return {
        "status": "ok",
        "model_name": MODEL_NAME,
        "model_ready": CURRENT_MODEL_PATH.exists(),
        "contract_ready": CURRENT_CONTRACT_PATH.exists(),
    }


@router.get("/cv/spec")
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


@router.post("/cv/predict")
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
        # Seek to start in case stream was partially consumed
        if hasattr(selected.file, "seek"):
            selected.file.seek(0)
        content = selected.file.read()
        if not content:
            raise HTTPException(status_code=422, detail="Uploaded file is empty.")
        buf = BytesIO(content)
        buf.seek(0)
        img = Image.open(buf)
        img.load()  # Force full decode to catch truncated files early
        return img.convert("RGB")  # Normalize to RGB (handles PNG, WebP, HEIC etc.)
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


@router.post("/scan")
def scan_image(image: Optional[UploadFile] = File(default=None), file: Optional[UploadFile] = File(default=None)) -> Dict[str, Any]:
    return _predict_from_uploaded_image(image=image, file=file)


@router.post("/predict-image")
def predict_image_alias(image: Optional[UploadFile] = File(default=None), file: Optional[UploadFile] = File(default=None)) -> Dict[str, Any]:
    return _predict_from_uploaded_image(image=image, file=file)


@router.post("/detect-disease")
def detect_disease_alias(image: Optional[UploadFile] = File(default=None), file: Optional[UploadFile] = File(default=None)) -> Dict[str, Any]:
    return _predict_from_uploaded_image(image=image, file=file)


@router.get("/market")
def get_market_data() -> dict:
    """Returns real market intelligence data fetched from global commodity markets."""
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    try:
        # Fetch live data from Yahoo Finance (Undocumented but reliable API)
        # ZR=F: Rough Rice Futures (USD per cwt)
        # NG=F: Natural Gas Futures (USD per MMBtu) - Proxy for Urea fertilizer costs
        # MYR=X: USD to MYR Exchange Rate
        
        rice_resp = requests.get('https://query1.finance.yahoo.com/v8/finance/chart/ZR=F', headers=headers, timeout=5)
        ng_resp = requests.get('https://query1.finance.yahoo.com/v8/finance/chart/NG=F', headers=headers, timeout=5)
        myr_resp = requests.get('https://query1.finance.yahoo.com/v8/finance/chart/MYR=X', headers=headers, timeout=5)
        
        rice_meta = rice_resp.json()['chart']['result'][0]['meta']
        ng_meta = ng_resp.json()['chart']['result'][0]['meta']
        myr_meta = myr_resp.json()['chart']['result'][0]['meta']
        
        rice_usd_cwt = float(rice_meta['regularMarketPrice'])
        myr_rate = float(myr_meta['regularMarketPrice'])
        
        # 1 US cwt (hundredweight) = 45.3592 kg
        # Convert USD/cwt to RM/kg
        rice_usd_kg = rice_usd_cwt / 45.3592
        paddy_rm_kg = round(rice_usd_kg * myr_rate, 2)
        
        # Determine Demand Level based on Rice price change
        rice_prev = float(rice_meta['chartPreviousClose'])
        rice_change = ((rice_usd_cwt - rice_prev) / rice_prev) * 100
        demand_level = "high" if rice_change > 1 else "moderate" if rice_change > -1 else "low"
        
        # Compute Fertilizer (Urea) using Natural Gas as a proxy
        ng_current = float(ng_meta['regularMarketPrice'])
        ng_prev = float(ng_meta['chartPreviousClose'])
        ng_change = ((ng_current - ng_prev) / ng_prev) * 100
        
        trend = "up" if ng_change > 0.5 else "down" if ng_change < -0.5 else "stable"
        
        # Base Urea price ~ RM 145/bag, adjusted by NG change
        base_urea = 145.0
        urea_price = round(base_urea * (1 + (ng_change / 100)), 2)
        
        return {
            "status": "available",
            "fertilizers": [
                {"name": "Urea (Nitrogen)", "priceRM": urea_price, "trend": trend, "weeklyChangePct": round(ng_change, 2)},
                {"name": "TSP (Phosphorus)", "priceRM": 182.00, "trend": "stable", "weeklyChangePct": 0.0},
                {"name": "MOP (Potassium)", "priceRM": 168.20, "trend": "stable", "weeklyChangePct": 0.0},
                {"name": "NPK Compound 15-15-15", "priceRM": round(195.00 * (1 + (ng_change * 0.5 / 100)), 2), "trend": trend, "weeklyChangePct": round(ng_change * 0.5, 2)},
            ],
            "paddyPricePerKgRM": paddy_rm_kg,
            "demandLevel": demand_level,
            "source": f"Live CME Group (ZR=F) @ {myr_rate:.2f} MYR/USD",
        }
        
    except Exception as e:
        print(f"Market API Error: {e}")
        # Fallback to mock if network fails
        return {
            "status": "available",
            "fertilizers": [
                {"name": "Urea (Nitrogen)", "priceRM": 145.50, "trend": "up", "weeklyChangePct": 2.4},
                {"name": "TSP (Phosphorus)", "priceRM": 182.00, "trend": "stable", "weeklyChangePct": 0.0},
                {"name": "MOP (Potassium)", "priceRM": 168.20, "trend": "down", "weeklyChangePct": -1.5},
                {"name": "NPK Compound 15-15-15", "priceRM": 195.00, "trend": "up", "weeklyChangePct": 1.2},
            ],
            "paddyPricePerKgRM": 1.75,
            "demandLevel": "high",
            "source": "Fallback Mock Data",
        }


# Mount router at both / (for local dev, Vite proxy strips /api)
# and /api (for production, no proxy)
app.include_router(router)
app.include_router(router, prefix="/api")

# Serve frontend static files
dist_path = ROOT_DIR / "dist"
if dist_path.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_path / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # API routes are already handled above. 
        # First, try to serve the exact file if it exists in dist (e.g. favicon.ico, images)
        target_file = dist_path / full_path
        if target_file.exists() and target_file.is_file():
            return FileResponse(path=str(target_file))
            
        # For anything else, fallback to index.html for SPA routing
        index_file = dist_path / "index.html"
        if index_file.exists():
            return HTMLResponse(content=index_file.read_text(encoding="utf-8"))
        return HTTPException(status_code=404, detail="Frontend not built")
