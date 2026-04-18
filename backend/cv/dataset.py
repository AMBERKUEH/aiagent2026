from __future__ import annotations

import csv
import hashlib
import json
import re
import shutil
import subprocess
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from sklearn.model_selection import train_test_split

from .config import (
    ANNOTATIONS_PATH,
    ANNOTATIONS_TEMPLATE_PATH,
    ARTIFACT_ROOT,
    CURRENT_ARTIFACT_ROOT,
    DATA_ROOT,
    GENERATED_ROOT,
    IMAGES_ROOT,
    KAGGLE_DATASET_SLUG,
    LABELS,
    OPTIONAL_COLUMNS,
    REPORT_ROOT,
    REQUIRED_COLUMNS,
    SPLITS_ROOT,
)

KAGGLE_LABEL_ALIASES = {
    "healthy": "healthy",
    "normal": "healthy",
    "healthyleaf": "healthy",
    "healthy leaf": "healthy",
    "bacterialblight": "bacterial_blight",
    "bacterialleafblight": "bacterial_blight",
    "bacterial_blight": "bacterial_blight",
    "bacterial leaf blight": "bacterial_blight",
    "blast": "blast",
    "leafblast": "blast",
    "leaf blast": "blast",
    "brownspot": "brown_spot",
    "brown_spot": "brown_spot",
    "brown spot": "brown_spot",
    "hispa": "hispa",
    "_hispa": "hispa",
    "ricehispa": "hispa",
    "rice hispa": "hispa",
    "tungro": "tungro",
}

HEALTHY_LABEL_ALIASES = {
    "healthy",
    "normal",
    "healthyleaf",
    "healthy leaf",
    "healthyimages",
    "healthy_images",
    "healthy images",
    "healthyimage",
    "healthy_image",
    "healthy image",
}
HEALTHY_LABEL_ALIASES_COMPACT = {re.sub(r"[^a-z]+", "", item) for item in HEALTHY_LABEL_ALIASES}


@dataclass
class ImageRecord:
    image_id: str
    file_path: str
    label_primary: str
    split: str = ""
    growth_stage: str = ""
    lighting: str = ""
    distance_cm: str = ""
    device_model: str = ""
    field_id: str = ""
    geo_region: str = ""
    severity_0_3: str = ""
    verified_by_expert: bool = False

    @property
    def image_path(self) -> Path:
        candidate = Path(self.file_path)
        return candidate if candidate.is_absolute() else DATA_ROOT / candidate


def ensure_workspace() -> None:
    for path in [DATA_ROOT, IMAGES_ROOT, GENERATED_ROOT, SPLITS_ROOT, ARTIFACT_ROOT, CURRENT_ARTIFACT_ROOT, REPORT_ROOT]:
        path.mkdir(parents=True, exist_ok=True)
    if ANNOTATIONS_TEMPLATE_PATH.exists() and not ANNOTATIONS_PATH.exists():
        shutil.copy2(ANNOTATIONS_TEMPLATE_PATH, ANNOTATIONS_PATH)


def _parse_bool(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y"}


def normalize_kaggle_label(raw_label: str) -> str | None:
    key = re.sub(r"[^a-z]+", "", raw_label.strip().lower())
    return KAGGLE_LABEL_ALIASES.get(key)


def normalize_healthy_label(raw_label: str) -> str | None:
    normalized = raw_label.strip().lower()
    compact = re.sub(r"[^a-z]+", "", normalized)
    if normalized in HEALTHY_LABEL_ALIASES or compact in HEALTHY_LABEL_ALIASES_COMPACT:
        return "healthy"
    return None


def load_annotations(csv_path: Path = ANNOTATIONS_PATH) -> list[ImageRecord]:
    ensure_workspace()
    if not csv_path.exists():
        raise FileNotFoundError(
            f"Missing dataset manifest at {csv_path}. Copy {csv_path.with_name('annotations.template.csv').name} to annotations.csv first."
        )

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("Annotation manifest is empty.")

        missing_columns = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
        if missing_columns:
            raise ValueError(f"Annotation manifest is missing required columns: {', '.join(missing_columns)}")

        rows: list[ImageRecord] = []
        for raw_row in reader:
            row = {key: (value or "").strip() for key, value in raw_row.items()}
            rows.append(
                ImageRecord(
                    image_id=row["image_id"],
                    file_path=row["file_path"],
                    label_primary=row["label_primary"],
                    split=row.get("split", ""),
                    growth_stage=row.get("growth_stage", ""),
                    lighting=row.get("lighting", ""),
                    distance_cm=row.get("distance_cm", ""),
                    device_model=row.get("device_model", ""),
                    field_id=row.get("field_id", ""),
                    geo_region=row.get("geo_region", ""),
                    severity_0_3=row.get("severity_0_3", ""),
                    verified_by_expert=_parse_bool(row.get("verified_by_expert")),
                )
            )
    return rows


def compute_file_hash(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def estimate_sharpness(file_path: Path) -> float:
    with Image.open(file_path) as image:
        grayscale = ImageOps.grayscale(image).resize((224, 224))
        pixels = np.asarray(grayscale, dtype=np.float32)

    grad_x = np.diff(pixels, axis=1)
    grad_y = np.diff(pixels, axis=0)
    return float(np.var(grad_x) + np.var(grad_y))


def validate_dataset(csv_path: Path = ANNOTATIONS_PATH, blur_threshold: float = 60.0) -> dict:
    rows = load_annotations(csv_path)
    label_counts = Counter()
    missing_files: list[str] = []
    invalid_labels: list[dict] = []
    blur_candidates: list[dict] = []
    hash_to_rows: defaultdict[str, list[str]] = defaultdict(list)
    split_counts = Counter()
    expert_verified = 0

    for record in rows:
        label_counts[record.label_primary] += 1
        if record.split:
            split_counts[record.split] += 1
        if record.verified_by_expert:
            expert_verified += 1
        if record.label_primary not in LABELS:
            invalid_labels.append({"image_id": record.image_id, "label_primary": record.label_primary})

        image_path = record.image_path
        if not image_path.exists():
            missing_files.append(record.file_path)
            continue

        file_hash = compute_file_hash(image_path)
        hash_to_rows[file_hash].append(record.file_path)

        sharpness = estimate_sharpness(image_path)
        if sharpness < blur_threshold:
            blur_candidates.append(
                {
                    "image_id": record.image_id,
                    "file_path": record.file_path,
                    "sharpness_score": round(sharpness, 2),
                }
            )

    duplicate_groups = [paths for paths in hash_to_rows.values() if len(paths) > 1]
    missing_required_labels = [label for label in LABELS if label_counts.get(label, 0) == 0]
    low_count_labels = {
        label: int(label_counts.get(label, 0))
        for label in LABELS
        if 0 < label_counts.get(label, 0) < 10
    }

    report = {
        "total_rows": len(rows),
        "label_counts": dict(sorted(label_counts.items())),
        "missing_required_labels": missing_required_labels,
        "low_count_labels": low_count_labels,
        "split_counts": dict(sorted(split_counts.items())),
        "missing_files": sorted(set(missing_files)),
        "invalid_labels": invalid_labels,
        "duplicate_groups": duplicate_groups,
        "blur_candidates": sorted(blur_candidates, key=lambda item: item["sharpness_score"]),
        "expert_verified_count": expert_verified,
        "required_columns": REQUIRED_COLUMNS,
        "optional_columns": OPTIONAL_COLUMNS,
        "recommended_next_step": (
            "Dataset is ready for split generation."
            if not missing_files and not invalid_labels and not missing_required_labels
            else "Fix manifest issues before training."
        ),
    }

    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    (REPORT_ROOT / "dataset_validation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def _copy_record(record: ImageRecord, split_name: str, destination_root: Path) -> None:
    destination_dir = destination_root / split_name / record.label_primary
    destination_dir.mkdir(parents=True, exist_ok=True)
    source_path = record.image_path
    suffix = source_path.suffix or ".jpg"
    destination_path = destination_dir / f"{record.image_id}{suffix}"
    shutil.copy2(source_path, destination_path)


def build_training_splits(
    csv_path: Path = ANNOTATIONS_PATH,
    output_root: Path = SPLITS_ROOT,
    test_size: float = 0.15,
    val_size: float = 0.15,
    seed: int = 42,
) -> dict:
    rows = [row for row in load_annotations(csv_path) if row.image_path.exists() and row.label_primary in LABELS]
    if len(rows) < 6:
        raise ValueError("At least 6 labeled images are required before building splits.")

    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    explicit_split_rows = [row for row in rows if row.split in {"train", "val", "test"}]
    if explicit_split_rows:
        split_map = {
            "train": [row for row in rows if row.split == "train"],
            "val": [row for row in rows if row.split == "val"],
            "test": [row for row in rows if row.split == "test"],
        }
    else:
        labels = [row.label_primary for row in rows]
        use_stratify = min(Counter(labels).values()) >= 2
        train_rows, test_rows = train_test_split(
            rows,
            test_size=test_size,
            random_state=seed,
            stratify=labels if use_stratify else None,
        )

        remaining_labels = [row.label_primary for row in train_rows]
        use_val_stratify = len(train_rows) >= 4 and min(Counter(remaining_labels).values()) >= 2
        adjusted_val_size = val_size / (1 - test_size)
        train_rows, val_rows = train_test_split(
            train_rows,
            test_size=adjusted_val_size,
            random_state=seed,
            stratify=remaining_labels if use_val_stratify else None,
        )
        split_map = {"train": train_rows, "val": val_rows, "test": test_rows}

    for split_name, split_rows in split_map.items():
        for record in split_rows:
            _copy_record(record, split_name, output_root)

    report = {
        "output_root": str(output_root),
        "split_sizes": {split: len(split_rows) for split, split_rows in split_map.items()},
    }
    (REPORT_ROOT / "split_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def build_golden_set(csv_path: Path = ANNOTATIONS_PATH) -> dict:
    rows = [asdict(row) for row in load_annotations(csv_path) if row.verified_by_expert]
    output_path = REPORT_ROOT / "golden_set.json"
    payload = {"count": len(rows), "rows": rows}
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def fetch_kaggle_dataset(
    dataset_slug: str = KAGGLE_DATASET_SLUG,
    download_root: Path = DATA_ROOT / "external",
) -> dict:
    ensure_workspace()
    download_root.mkdir(parents=True, exist_ok=True)

    kagglehub_error: str | None = None

    # Preferred path: kagglehub Python API.
    try:
        import kagglehub  # type: ignore

        dataset_path = Path(kagglehub.dataset_download(dataset_slug))
        return {
            "dataset_slug": dataset_slug,
            "download_method": "kagglehub",
            "dataset_path": str(dataset_path.resolve()),
        }
    except ImportError:
        kagglehub_error = "kagglehub is not installed"
    except Exception as exc:
        # kagglehub occasionally fails to extract certain archives on Windows;
        # we fall back to Kaggle CLI below in that case.
        kagglehub_error = str(exc)

    # Fallback path: Kaggle CLI.
    safe_slug = dataset_slug.replace("/", "-")
    target_dir = download_root / safe_slug
    target_dir.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run(
            ["kaggle", "datasets", "download", "-d", dataset_slug, "-p", str(target_dir), "--unzip"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Kaggle downloader is unavailable. Install `kagglehub` or Kaggle CLI, then authenticate with Kaggle first."
        ) from exc
    except subprocess.CalledProcessError as exc:
        message = (exc.stderr or exc.stdout or "").strip()
        raise RuntimeError(f"Kaggle download failed: {message}") from exc

    report = {
        "dataset_slug": dataset_slug,
        "download_method": "kaggle_cli",
        "dataset_path": str(target_dir.resolve()),
    }
    if kagglehub_error:
        report["kagglehub_fallback_reason"] = kagglehub_error
    return report


def import_kaggle_rice_leaf_dataset(
    source_dir: Path,
    destination_images_root: Path = IMAGES_ROOT,
    annotations_path: Path = ANNOTATIONS_PATH,
) -> dict:
    ensure_workspace()
    source_dir = source_dir.resolve()
    if not source_dir.exists():
        raise FileNotFoundError(f"Dataset folder does not exist: {source_dir}")

    image_files = [
        path
        for path in source_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    ]
    if not image_files:
        raise ValueError(f"No image files were found under {source_dir}")

    imported_rows: list[dict[str, str]] = []
    skipped_paths: list[str] = []
    skipped_unmapped_labels: Counter[str] = Counter()

    for image_path in sorted(image_files):
        raw_label = image_path.parent.name
        normalized_label = normalize_kaggle_label(raw_label)
        if normalized_label is None:
            skipped_paths.append(str(image_path))
            skipped_unmapped_labels[raw_label] += 1
            continue

        if normalized_label not in LABELS:
            skipped_paths.append(str(image_path))
            continue

        safe_name = re.sub(r"[^a-z0-9]+", "-", image_path.stem.lower()).strip("-") or "image"
        relative_source_key = str(image_path.relative_to(source_dir)).replace("\\", "/").lower()
        source_hash = hashlib.sha1(relative_source_key.encode("utf-8")).hexdigest()[:10]
        image_id = f"{normalized_label}-{safe_name}-{source_hash}"
        destination_name = f"{image_id}{image_path.suffix.lower()}"
        relative_path = Path("images") / destination_name
        destination_path = destination_images_root / destination_name

        if not destination_path.exists():
            shutil.copy2(image_path, destination_path)

        imported_rows.append(
            {
                "image_id": image_id,
                "file_path": relative_path.as_posix(),
                "label_primary": normalized_label,
                "split": "",
                "growth_stage": "",
                "lighting": "",
                "distance_cm": "",
                "device_model": "",
                "field_id": "",
                "geo_region": "",
                "severity_0_3": "",
                "verified_by_expert": "false",
            }
        )

    if not imported_rows:
        raise ValueError("No supported Kaggle disease folders were found. Expected class folders like Blast, Brownspot, Hispa, Tungro, or Bacterialblight.")

    retained_rows: list[dict[str, str]] = []
    if annotations_path.exists():
        with annotations_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                retained_rows.append({key: (value or "").strip() for key, value in row.items()})

    merged_rows = retained_rows + imported_rows
    dedup_by_id: dict[str, dict[str, str]] = {}
    for row in merged_rows:
        dedup_by_id[row["image_id"]] = row

    with annotations_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS + OPTIONAL_COLUMNS)
        writer.writeheader()
        writer.writerows(dedup_by_id.values())

    report = {
        "dataset_source": str(source_dir),
        "annotations_path": str(annotations_path),
        "imported_images": len(imported_rows),
        "retained_existing_rows": len(retained_rows),
        "skipped_images": len(skipped_paths),
        "skipped_paths": skipped_paths[:20],
        "skipped_unmapped_class_counts": dict(sorted(skipped_unmapped_labels.items())),
        "label_counts": dict(sorted(Counter(row["label_primary"] for row in dedup_by_id.values()).items())),
    }
    (REPORT_ROOT / "kaggle_import_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def import_healthy_images(
    source_dir: Path,
    destination_images_root: Path = IMAGES_ROOT,
    annotations_path: Path = ANNOTATIONS_PATH,
) -> dict:
    ensure_workspace()
    source_dir = source_dir.resolve()
    if not source_dir.exists():
        raise FileNotFoundError(f"Healthy source folder does not exist: {source_dir}")

    image_files = [
        path
        for path in source_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    ]
    if not image_files:
        raise ValueError(f"No image files were found under {source_dir}")

    existing_rows: list[dict[str, str]] = []
    if annotations_path.exists():
        with annotations_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                existing_rows.append({key: (value or "").strip() for key, value in row.items()})

    imported_rows: list[dict[str, str]] = []
    skipped_non_healthy = 0
    for image_path in sorted(image_files):
        # Only ingest files from folders that explicitly map to healthy labels.
        ancestor_names = [part for part in image_path.relative_to(source_dir).parts[:-1]]
        candidate_names = [source_dir.name, *ancestor_names]
        matched_healthy = any(normalize_healthy_label(name) == "healthy" for name in candidate_names)
        if not matched_healthy:
            skipped_non_healthy += 1
            continue

        safe_name = re.sub(r"[^a-z0-9]+", "-", image_path.stem.lower()).strip("-") or "image"
        relative_source_key = str(image_path.relative_to(source_dir)).replace("\\", "/").lower()
        source_hash = hashlib.sha1(relative_source_key.encode("utf-8")).hexdigest()[:10]
        image_id = f"healthy-{safe_name}-{source_hash}"
        destination_name = f"{image_id}{image_path.suffix.lower()}"
        relative_path = Path("images") / destination_name
        destination_path = destination_images_root / destination_name

        if not destination_path.exists():
            shutil.copy2(image_path, destination_path)

        imported_rows.append(
            {
                "image_id": image_id,
                "file_path": relative_path.as_posix(),
                "label_primary": "healthy",
                "split": "",
                "growth_stage": "",
                "lighting": "",
                "distance_cm": "",
                "device_model": "",
                "field_id": "",
                "geo_region": "",
                "severity_0_3": "",
                "verified_by_expert": "false",
            }
        )

    merged_rows = existing_rows + imported_rows
    dedup_by_id: dict[str, dict[str, str]] = {}
    for row in merged_rows:
        dedup_by_id[row["image_id"]] = row

    with annotations_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=REQUIRED_COLUMNS + OPTIONAL_COLUMNS)
        writer.writeheader()
        writer.writerows(dedup_by_id.values())

    report = {
        "source_dir": str(source_dir),
        "annotations_path": str(annotations_path),
        "imported_healthy_images": len(imported_rows),
        "skipped_non_healthy_images": skipped_non_healthy,
        "total_rows_after_merge": len(dedup_by_id),
        "label_counts": dict(sorted(Counter(row["label_primary"] for row in dedup_by_id.values()).items())),
    }
    (REPORT_ROOT / "healthy_import_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
