from __future__ import annotations

from pathlib import Path


CV_ROOT = Path(__file__).resolve().parent
DATA_ROOT = CV_ROOT / "data"
IMAGES_ROOT = DATA_ROOT / "images"
ANNOTATIONS_PATH = DATA_ROOT / "annotations.csv"
ANNOTATIONS_TEMPLATE_PATH = DATA_ROOT / "annotations.template.csv"
GENERATED_ROOT = DATA_ROOT / "generated"
SPLITS_ROOT = GENERATED_ROOT / "splits"
ARTIFACT_ROOT = CV_ROOT / "artifacts"
CURRENT_ARTIFACT_ROOT = ARTIFACT_ROOT / "current"
REPORT_ROOT = CV_ROOT / "reports"
MODEL_CARD_TEMPLATE_PATH = CV_ROOT / "MODEL_CARD_TEMPLATE.md"

MODEL_NAME = "efficientnet_b0"
INPUT_SIZE = (224, 224)
CONFIDENCE_THRESHOLD = 0.65
DATASET_SOURCE = (
    "https://www.kaggle.com/datasets/nirmalsankalana/rice-leaf-disease-image, "
    "https://www.kaggle.com/datasets/nizorogbezuode/rice-leaf-images, "
    "https://www.kaggle.com/datasets/rajkumar898/rice-plant-dataset (healthy-only)"
)
KAGGLE_DATASET_SLUG = "nirmalsankalana/rice-leaf-disease-image"
KAGGLE_HEALTHY_DATASET_SLUG = "nizorogbezuode/rice-leaf-images"

LABELS = [
    "healthy",
    "bacterial_blight",
    "blast",
    "brown_spot",
    "hispa",
    "tungro",
]
FALLBACK_LABEL = "unknown"

CURRENT_MODEL_PATH = CURRENT_ARTIFACT_ROOT / "model.tflite"
CURRENT_LABELS_PATH = CURRENT_ARTIFACT_ROOT / "labels.txt"
CURRENT_CONTRACT_PATH = CURRENT_ARTIFACT_ROOT / "contract.json"
CURRENT_MODEL_CARD_PATH = CURRENT_ARTIFACT_ROOT / "MODEL_CARD.md"

REQUIRED_COLUMNS = ["image_id", "file_path", "label_primary"]
OPTIONAL_COLUMNS = [
    "split",
    "growth_stage",
    "lighting",
    "distance_cm",
    "device_model",
    "field_id",
    "geo_region",
    "severity_0_3",
    "verified_by_expert",
]
