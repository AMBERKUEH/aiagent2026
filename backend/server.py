from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
from pydantic import BaseModel


MODEL_PATH = Path(__file__).with_name("crop_yield_model.pkl")


class PredictionRequest(BaseModel):
    humidity: float
    light_intensity: float
    soil_moisture: float
    temperature: float
    water_level: float | None = None
    waterLevel: float | None = None


def load_bundle() -> dict:
    return joblib.load(MODEL_PATH)


bundle = load_bundle()
model = bundle["model"]
test_r2 = float(bundle.get("test_r2", 0.4))
feature_names = bundle.get(
    "feature_names",
    ["humidity", "light_intensity", "soil_moisture", "temperature", "water_level"],
)

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
    return {
        "status": "ok",
        "test_r2": test_r2,
        "feature_names": feature_names,
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict:
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
