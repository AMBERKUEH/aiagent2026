from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from .config import (
    ANNOTATIONS_PATH,
    CURRENT_CONTRACT_PATH,
    CURRENT_LABELS_PATH,
    CURRENT_MODEL_PATH,
    DATA_ROOT,
    KAGGLE_DATASET_SLUG,
    REPORT_ROOT,
    SPLITS_ROOT,
)
from .dataset import (
    build_golden_set,
    build_training_splits,
    ensure_workspace,
    fetch_kaggle_dataset,
    import_healthy_images,
    import_kaggle_rice_leaf_dataset,
    validate_dataset,
)


def _print_json(payload: dict) -> None:
    print(json.dumps(payload, indent=2))

def _pick_default_test_image() -> Path | None:
    preferred_dir = DATA_ROOT / "inference_samples"
    for path in preferred_dir.glob("*"):
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
            return path

    for path in sorted((SPLITS_ROOT / "test").glob("*/*")):
        if path.is_file():
            return path
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="SmartPaddy Person 1 computer vision CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init-workspace", help="Create the CV data, reports, and artifact directories.")

    validate_parser = subparsers.add_parser("validate-dataset", help="Validate the image manifest and quality gates.")
    validate_parser.add_argument("--csv", default=str(ANNOTATIONS_PATH), help="Path to annotations.csv")
    validate_parser.add_argument("--blur-threshold", type=float, default=60.0, help="Flag images below this sharpness score")

    subparsers.add_parser("build-golden-set", help="Export the expert-verified subset used for regression checks.")
    subparsers.add_parser("build-splits", help="Materialize train/val/test folders from annotations.csv.")

    fetch_parser = subparsers.add_parser("fetch-kaggle", help="Download the Kaggle rice leaf disease dataset locally.")
    fetch_parser.add_argument("--dataset-slug", default=KAGGLE_DATASET_SLUG, help="Kaggle dataset slug in owner/name form")
    fetch_parser.add_argument("--import-data", action="store_true", help="Import downloaded images into SmartPaddy manifest after download")

    import_parser = subparsers.add_parser("import-kaggle", help="Import the Kaggle rice leaf disease dataset into the local SmartPaddy manifest.")
    import_parser.add_argument("--source-dir", required=True, help="Path to the extracted Kaggle dataset folder")

    import_healthy_parser = subparsers.add_parser("import-healthy", help="Import healthy rice leaf images into the local SmartPaddy manifest.")
    import_healthy_parser.add_argument("--source-dir", required=True, help="Path to folder containing healthy leaf images")

    train_parser = subparsers.add_parser("train", help="Train and export the EfficientNetB0 classifier.")
    train_parser.add_argument("--epochs", type=int, default=20)
    train_parser.add_argument("--batch-size", type=int, default=16)
    train_parser.add_argument("--learning-rate", type=float, default=0.0003)
    train_parser.add_argument("--train-whole-model", action="store_true")

    predict_parser = subparsers.add_parser("predict", help="Run local inference on a single image using the current TFLite artifact.")
    predict_parser.add_argument("--image", required=True, help="Path to a local image")

    test_parser = subparsers.add_parser("test-model", help="Validate trained artifacts and run one local prediction.")
    test_parser.add_argument("--image", help="Optional path to an image file for test inference")

    args = parser.parse_args()

    if args.command == "init-workspace":
        ensure_workspace()
        _print_json({"status": "ok", "message": "Workspace ready."})
        return

    if args.command == "validate-dataset":
        report = validate_dataset(Path(args.csv), blur_threshold=args.blur_threshold)
        _print_json(report)
        return

    if args.command == "build-golden-set":
        _print_json(build_golden_set())
        return

    if args.command == "build-splits":
        _print_json(build_training_splits())
        return

    if args.command == "fetch-kaggle":
        download_report = fetch_kaggle_dataset(args.dataset_slug)
        if args.import_data:
            import_report = import_kaggle_rice_leaf_dataset(Path(download_report["dataset_path"]))
            _print_json({"download": download_report, "import": import_report})
            return
        _print_json(download_report)
        return

    if args.command == "import-kaggle":
        _print_json(import_kaggle_rice_leaf_dataset(Path(args.source_dir)))
        return

    if args.command == "import-healthy":
        _print_json(import_healthy_images(Path(args.source_dir)))
        return

    if args.command == "train":
        from .train import TrainingConfig, train_pipeline

        summary = train_pipeline(
            TrainingConfig(
                epochs=args.epochs,
                batch_size=args.batch_size,
                learning_rate=args.learning_rate,
                train_whole_model=args.train_whole_model,
            )
        )
        _print_json(summary)
        return

    if args.command == "predict":
        from .inference import predict_image

        with Image.open(args.image) as image:
            result = predict_image(image)
        _print_json(result)
        return

    if args.command == "test-model":
        from .inference import predict_image

        missing = [
            str(path)
            for path in [CURRENT_MODEL_PATH, CURRENT_LABELS_PATH, CURRENT_CONTRACT_PATH]
            if not path.exists()
        ]
        if missing:
            raise SystemExit(
                json.dumps(
                    {
                        "status": "error",
                        "message": "Model artifacts are missing. Run training first.",
                        "missing_artifacts": missing,
                    },
                    indent=2,
                )
            )

        summary_path = REPORT_ROOT / "latest_training_summary.json"
        summary_metrics: dict = {}
        if summary_path.exists():
            try:
                summary_metrics = json.loads(summary_path.read_text(encoding="utf-8")).get("metrics", {})
            except Exception:
                summary_metrics = {}

        image_path = Path(args.image) if args.image else _pick_default_test_image()
        if image_path is None or not image_path.exists():
            raise SystemExit(
                json.dumps(
                    {
                        "status": "error",
                        "message": "No test image found. Provide --image or place a file in backend/cv/data/inference_samples/.",
                    },
                    indent=2,
                )
            )

        with Image.open(image_path) as image:
            prediction = predict_image(image)

        _print_json(
            {
                "status": "ok",
                "artifacts_ready": True,
                "test_image": str(image_path),
                "macro_f1": summary_metrics.get("macro_f1"),
                "prediction": prediction,
            }
        )
        return


if __name__ == "__main__":
    main()
