import base64
import json
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from .config import (
    CONFIDENCE_THRESHOLD,
    CURRENT_CONTRACT_PATH,
    CURRENT_LABELS_PATH,
    CURRENT_MODEL_PATH,
    FALLBACK_LABEL,
    INPUT_SIZE,
    LABELS,
)


class ModelNotReadyError(RuntimeError):
    """Raised when a deployable TFLite artifact is not available."""


def _load_interpreter(model_path: Path):  # pylint: disable=import-outside-toplevel
    try:
        from tflite_runtime.interpreter import Interpreter  # type: ignore[import-untyped]  # noqa: PLC0415  # pylint: disable=import-outside-toplevel,import-error
        return Interpreter(model_path=str(model_path))
    except Exception:
        try:
            import tensorflow as tf  # pylint: disable=import-outside-toplevel
            return tf.lite.Interpreter(model_path=str(model_path))
        except Exception as exc:
            raise RuntimeError(
                "Unable to load TFLite interpreter. Install tflite-runtime or tensorflow."
            ) from exc


def load_labels() -> list[str]:
    if CURRENT_LABELS_PATH.exists():
        return [line.strip() for line in CURRENT_LABELS_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    return LABELS


def load_contract() -> dict:
    if CURRENT_CONTRACT_PATH.exists():
        return json.loads(CURRENT_CONTRACT_PATH.read_text(encoding="utf-8"))
    return {
        "model_name": "efficientnet_b0",
        "input_size": list(INPUT_SIZE),
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "labels": load_labels(),
        "fallback_label": FALLBACK_LABEL,
    }


def _prepare_input(image: Image.Image, input_details: dict) -> np.ndarray:
    resized = image.convert("RGB").resize(INPUT_SIZE)
    array = np.asarray(resized)
    dtype = input_details["dtype"]

    if np.issubdtype(dtype, np.floating):
        return (array.astype(np.float32) / 255.0)[np.newaxis, ...]

    scale, zero_point = input_details.get("quantization", (0.0, 0))
    if not scale:
        return array.astype(dtype)[np.newaxis, ...]

    quantized = np.round(array / scale + zero_point)
    info = np.iinfo(dtype)
    quantized = np.clip(quantized, info.min, info.max).astype(dtype)
    return quantized[np.newaxis, ...]


def _softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    exp = np.exp(shifted)
    return exp / np.sum(exp)


def _run_paddy_leaf_guard(image: Image.Image) -> dict[str, Any]:
    """
    Lightweight pre-check to block clearly non-paddy uploads.
    This is intentionally conservative and only rejects obvious non-leaf images.
    """
    rgb = np.asarray(image.convert("RGB").resize(INPUT_SIZE), dtype=np.uint8)
    if rgb.size == 0:
        return {
            "is_paddy_like": False,
            "message": "Image is empty or unreadable. Please upload a clear paddy leaf photo.",
            "metrics": {"green_ratio": 0.0, "detail_std": 0.0},
        }

    # Approximate "green vegetation" ratio.
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    strong_green = (g > r * 1.08) & (g > b * 1.08) & (g > 45)
    green_ratio = float(np.mean(strong_green))

    # Flat photos (screenshots, paper, walls) tend to have very low local variance.
    gray = np.asarray(image.convert("L").resize(INPUT_SIZE), dtype=np.float32)
    detail_std = float(np.std(gray))

    is_paddy_like = not (green_ratio < 0.05 and detail_std < 22.0)
    if is_paddy_like:
        return {
            "is_paddy_like": True,
            "message": "",
            "metrics": {"green_ratio": round(green_ratio, 4), "detail_std": round(detail_std, 2)},
        }

    return {
        "is_paddy_like": False,
        "message": "This image does not look like a paddy leaf. Please upload a paddy leaf picture.",
        "metrics": {"green_ratio": round(green_ratio, 4), "detail_std": round(detail_std, 2)},
    }


def predict_image(image: Image.Image, model_path: Path = CURRENT_MODEL_PATH, top_k: int | None = None) -> dict:
    if not model_path.exists():
        raise ModelNotReadyError(
            f"Missing TFLite model at {model_path}. Train and export a model with `python -m backend.cv.cli train` first."
        )

    paddy_guard = _run_paddy_leaf_guard(image)
    if not paddy_guard["is_paddy_like"]:
        return {
            "predicted_label": FALLBACK_LABEL,
            "confidence": 0.0,
            "top_predictions": [],
            "all_predictions": [],
            "contract": load_contract(),
            "status": "non_paddy_image",
            "message": paddy_guard["message"],
            "non_paddy_check": paddy_guard["metrics"],
        }

    interpreter = _load_interpreter(model_path)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()[0]
    output_details = interpreter.get_output_details()[0]

    input_tensor = _prepare_input(image, input_details)
    interpreter.set_tensor(input_details["index"], input_tensor)
    interpreter.invoke()

    output = interpreter.get_tensor(output_details["index"])[0]
    output_array = output.astype(np.float32)
    if np.issubdtype(output_details["dtype"], np.integer):
        scale, zero_point = output_details.get("quantization", (0.0, 0))
        if scale:
            output_array = (output.astype(np.float32) - zero_point) * scale

    if float(np.min(output_array)) >= 0.0 and np.isclose(float(np.sum(output_array)), 1.0, atol=0.1):
        probabilities = output_array
    else:
        probabilities = _softmax(output_array)

    labels = load_labels()
    label_scores = [
        {"label": label, "confidence": round(float(probabilities[index]), 4)}
        for index, label in enumerate(labels[: len(probabilities)])
    ]
    label_scores.sort(key=lambda item: item["confidence"], reverse=True)

    if top_k is None or top_k <= 0:
        top_predictions = label_scores
    else:
        top_predictions = label_scores[:top_k]
    best_prediction = top_predictions[0] if top_predictions else {"label": FALLBACK_LABEL, "confidence": 0.0}
    predicted_label = best_prediction["label"]
    if best_prediction["confidence"] < load_contract()["confidence_threshold"]:
        predicted_label = FALLBACK_LABEL

    return {
        "predicted_label": predicted_label,
        "confidence": round(best_prediction["confidence"], 4),
        "top_predictions": top_predictions,
        "all_predictions": label_scores,
        "contract": load_contract(),
        "status": "ok",
    }


def load_image_from_request(image_path: str | None = None, image_base64: str | None = None) -> Image.Image:
    if image_base64:
        # Strip data URL prefix (e.g. "data:image/jpeg;base64,")
        if "," in image_base64:
            payload = image_base64.split(",", 1)[1]
        else:
            payload = image_base64
        # Strip any whitespace/newlines that could corrupt decoding
        payload = payload.strip().replace(" ", "+")
        # Fix padding
        missing_padding = len(payload) % 4
        if missing_padding:
            payload += "=" * (4 - missing_padding)
        try:
            image_bytes = base64.b64decode(payload)
        except Exception as exc:
            raise ValueError(f"Invalid base64 image data: {exc}") from exc
        if len(image_bytes) < 8:
            raise ValueError(f"Decoded image is too small ({len(image_bytes)} bytes) — likely an encoding error.")
        buf = BytesIO(image_bytes)
        buf.seek(0)
        try:
            img = Image.open(buf)
            img.load()
        except Exception as exc:
            # Try re-seek in case of any stream issue
            buf.seek(0)
            img = Image.open(buf)
            img.load()
        return img.convert("RGB")

    if image_path:
        path = Path(image_path)
        img = Image.open(path)
        img.load()
        return img.convert("RGB")

    raise ValueError("Provide either image_path or image_base64.")
