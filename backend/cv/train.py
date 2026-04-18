from __future__ import annotations

import json
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix, f1_score

from .config import (
    ANNOTATIONS_PATH,
    ARTIFACT_ROOT,
    CONFIDENCE_THRESHOLD,
    CURRENT_ARTIFACT_ROOT,
    CURRENT_CONTRACT_PATH,
    CURRENT_LABELS_PATH,
    CURRENT_MODEL_CARD_PATH,
    CURRENT_MODEL_PATH,
    DATASET_SOURCE,
    FALLBACK_LABEL,
    INPUT_SIZE,
    LABELS,
    MODEL_CARD_TEMPLATE_PATH,
    MODEL_NAME,
    REPORT_ROOT,
    SPLITS_ROOT,
)
from .dataset import build_golden_set, build_training_splits, ensure_workspace, validate_dataset
from .inference import predict_image


@dataclass
class TrainingConfig:
    epochs: int = 20
    batch_size: int = 16
    learning_rate: float = 0.0003
    train_whole_model: bool = False
    seed: int = 42
    representative_samples: int = 200


def _require_tensorflow():
    try:
        import tensorflow as tf
        import keras
    except ImportError as exc:
        raise RuntimeError("TensorFlow is not installed. Install backend/requirements-cv.txt before training.") from exc
    return tf, keras


def _build_datasets(tf, keras, config: TrainingConfig):
    train_dir = SPLITS_ROOT / "train"
    val_dir = SPLITS_ROOT / "val"
    if not train_dir.exists() or not val_dir.exists():
        raise ValueError("Train/val splits not found. Run split generation before training.")

    class_names = [label for label in LABELS if (train_dir / label).exists()]
    if sorted(class_names) != sorted(LABELS):
        raise ValueError(
            f"Detected classes {class_names}, but expected {LABELS}. Check dataset labels and import mapping before training."
        )

    label_to_index = {label: index for index, label in enumerate(class_names)}
    image_extensions = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    def collect_file_label_pairs(split_dir: Path) -> tuple[list[str], list[int]]:
        file_paths: list[str] = []
        labels: list[int] = []
        for label in class_names:
            class_dir = split_dir / label
            if not class_dir.exists():
                continue
            for path in sorted(class_dir.rglob("*")):
                if path.is_file() and path.suffix.lower() in image_extensions:
                    file_paths.append(str(path))
                    labels.append(label_to_index[label])
        if not file_paths:
            raise ValueError(f"No images found under {split_dir}.")
        return file_paths, labels

    train_files, train_labels = collect_file_label_pairs(train_dir)
    val_files, val_labels = collect_file_label_pairs(val_dir)

    autotune = tf.data.AUTOTUNE

    def decode_and_resize(path, label):
        image_bytes = tf.io.read_file(path)
        image = tf.io.decode_image(image_bytes, channels=3, expand_animations=False)
        image = tf.image.resize(image, INPUT_SIZE)
        image = tf.cast(image, tf.float32)
        return image, label

    train_ds = tf.data.Dataset.from_tensor_slices((train_files, train_labels))
    train_ds = train_ds.shuffle(len(train_files), seed=config.seed, reshuffle_each_iteration=True)
    train_ds = train_ds.map(decode_and_resize, num_parallel_calls=autotune)
    train_ds = train_ds.batch(config.batch_size).prefetch(autotune)

    val_ds = tf.data.Dataset.from_tensor_slices((val_files, val_labels))
    val_ds = val_ds.map(decode_and_resize, num_parallel_calls=autotune)
    val_ds = val_ds.batch(config.batch_size).prefetch(autotune)

    return train_ds, val_ds, class_names


def _build_model(tf, keras, num_classes: int, config: TrainingConfig):
    input_shape = (INPUT_SIZE[0], INPUT_SIZE[1], 3)
    inputs = keras.Input(shape=input_shape)
    x = inputs

    base_model = keras.applications.EfficientNetB0(
        include_top=False,
        weights="imagenet",
        input_shape=input_shape,
    )
    base_model.trainable = config.train_whole_model

    x = base_model(x, training=config.train_whole_model)
    x = keras.layers.GlobalAveragePooling2D()(x)
    x = keras.layers.Dropout(0.2)(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax")(x)
    model = keras.Model(inputs=inputs, outputs=outputs, name="smartpaddy_efficientnet_b0")

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=config.learning_rate),
        loss=keras.losses.SparseCategoricalCrossentropy(),
        metrics=["accuracy"],
    )
    return model


def _export_tflite_int8(tf, model, train_ds, run_root: Path, representative_samples: int) -> Path:
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]

    def representative_dataset():
        dataset = train_ds.unbatch().batch(1).take(representative_samples)
        for image_batch, _ in dataset:
            yield [image_batch]

    converter.representative_dataset = representative_dataset
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.uint8
    converter.inference_output_type = tf.uint8

    tflite_model = converter.convert()
    model_path = run_root / "model.tflite"
    model_path.write_bytes(tflite_model)
    return model_path


def _train_export_model(run_root: Path, config: TrainingConfig) -> Path:
    tf, keras = _require_tensorflow()
    train_ds, val_ds, class_names = _build_datasets(tf, keras, config)
    model = _build_model(tf, keras, len(class_names), config)

    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=4, restore_best_weights=True),
    ]
    model.fit(train_ds, validation_data=val_ds, epochs=config.epochs, callbacks=callbacks, verbose=2)

    labels_path = run_root / "labels.txt"
    labels_path.write_text("\n".join(class_names) + "\n", encoding="utf-8")

    return _export_tflite_int8(tf, model, train_ds, run_root, config.representative_samples)


def _collect_test_image_paths() -> list[Path]:
    return sorted((SPLITS_ROOT / "test").glob("*/*"))


def _evaluate_exported_model() -> dict:
    y_true: list[str] = []
    y_pred: list[str] = []

    for image_path in _collect_test_image_paths():
        y_true.append(image_path.parent.name)
        with Image.open(image_path) as image:
            prediction = predict_image(image)
        y_pred.append(prediction["predicted_label"])

    if not y_true:
        raise ValueError("The test split is empty. Build dataset splits before evaluation.")

    macro_f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
    report = classification_report(y_true, y_pred, labels=LABELS, zero_division=0, output_dict=True)
    matrix = confusion_matrix(y_true, y_pred, labels=LABELS).tolist()
    return {
        "macro_f1": round(macro_f1, 4),
        "classification_report": report,
        "confusion_matrix": matrix,
        "labels": LABELS,
    }


def _publish_current_artifacts(run_root: Path, metrics: dict) -> None:
    CURRENT_ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    model_path = run_root / "model.tflite"
    labels_path = run_root / "labels.txt"

    shutil.copy2(model_path, CURRENT_MODEL_PATH)
    if labels_path.exists():
        shutil.copy2(labels_path, CURRENT_LABELS_PATH)
    else:
        CURRENT_LABELS_PATH.write_text("\n".join(LABELS) + "\n", encoding="utf-8")

    contract = {
        "model_name": MODEL_NAME,
        "input_size": list(INPUT_SIZE),
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "labels": [line.strip() for line in CURRENT_LABELS_PATH.read_text(encoding="utf-8").splitlines() if line.strip()],
        "fallback_label": FALLBACK_LABEL,
        "dataset_source": DATASET_SOURCE,
        "metrics": {"macro_f1": metrics["macro_f1"]},
    }
    CURRENT_CONTRACT_PATH.write_text(json.dumps(contract, indent=2), encoding="utf-8")

    model_card = MODEL_CARD_TEMPLATE_PATH.read_text(encoding="utf-8")
    model_card = model_card.replace("{{MODEL_NAME}}", MODEL_NAME)
    model_card = model_card.replace("{{MACRO_F1}}", str(metrics["macro_f1"]))
    model_card = model_card.replace("{{INPUT_SIZE}}", f"{INPUT_SIZE[0]}x{INPUT_SIZE[1]}")
    model_card = model_card.replace("{{CONFIDENCE_THRESHOLD}}", str(CONFIDENCE_THRESHOLD))
    CURRENT_MODEL_CARD_PATH.write_text(model_card, encoding="utf-8")


def train_pipeline(config: TrainingConfig | None = None) -> dict:
    ensure_workspace()
    config = config or TrainingConfig()

    validation_report = validate_dataset(ANNOTATIONS_PATH)
    if (
        validation_report["missing_files"]
        or validation_report["invalid_labels"]
        or validation_report.get("missing_required_labels")
    ):
        raise ValueError("Dataset validation failed. Review backend/cv/reports/dataset_validation.json before training.")

    build_golden_set(ANNOTATIONS_PATH)
    build_training_splits(ANNOTATIONS_PATH, SPLITS_ROOT, seed=config.seed)

    run_name = datetime.now(timezone.utc).strftime("run_%Y%m%dT%H%M%SZ")
    run_root = ARTIFACT_ROOT / run_name
    run_root.mkdir(parents=True, exist_ok=True)

    _train_export_model(run_root, config)
    _publish_current_artifacts(run_root, {"macro_f1": 0.0})
    metrics = _evaluate_exported_model()
    _publish_current_artifacts(run_root, metrics)

    summary = {
        "run_name": run_name,
        "config": asdict(config),
        "validation_report_path": str(REPORT_ROOT / "dataset_validation.json"),
        "split_report_path": str(REPORT_ROOT / "split_report.json"),
        "golden_set_path": str(REPORT_ROOT / "golden_set.json"),
        "metrics": metrics,
        "current_model_path": str(CURRENT_MODEL_PATH),
        "current_contract_path": str(CURRENT_CONTRACT_PATH),
    }
    (run_root / "training_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (REPORT_ROOT / "latest_training_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary
