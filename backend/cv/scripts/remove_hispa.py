#!/usr/bin/env python3
"""Remove 'hispa' rows from annotations and update current artifacts.

Run from repository root with the project's python environment active.
"""
from pathlib import Path
import csv
import json

ROOT = Path(__file__).resolve().parents[3]
CV_DATA = ROOT / "backend" / "cv" / "data"
ANNOTATIONS = CV_DATA / "annotations.csv"
ANNOTATIONS_BAK = CV_DATA / "annotations.csv.bak"
TEMPLATE = CV_DATA / "annotations.template.csv"

ARTIFACTS = ROOT / "backend" / "cv" / "artifacts" / "current"
LABELS_TXT = ARTIFACTS / "labels.txt"
CONTRACT = ARTIFACTS / "contract.json"
MODEL_CARD = ARTIFACTS / "MODEL_CARD.md"


def filter_annotations():
    if not ANNOTATIONS.exists():
        print(f"No annotations file at {ANNOTATIONS}; nothing to do.")
        return

    # Backup
    ANNOTATIONS.rename(ANNOTATIONS_BAK)

    with ANNOTATIONS_BAK.open("r", encoding="utf-8-sig", newline="") as inp, ANNOTATIONS.open("w", encoding="utf-8", newline="") as out:
        reader = csv.DictReader(inp)
        writer = csv.DictWriter(out, fieldnames=reader.fieldnames)
        writer.writeheader()
        removed = 0
        kept = 0
        for row in reader:
            if (row.get("label_primary") or "").strip().lower() == "hispa":
                removed += 1
                continue
            writer.writerow(row)
            kept += 1

    print(f"Filtered annotations: kept={kept}, removed={removed}. Backup at {ANNOTATIONS_BAK}")


def update_labels_txt():
    if not LABELS_TXT.exists():
        print("No labels.txt found; skipping.")
        return
    lines = [l.strip() for l in LABELS_TXT.read_text(encoding="utf-8").splitlines() if l.strip()]
    new_lines = [l for l in lines if l != "hispa"]
    LABELS_TXT.write_text("\n".join(new_lines) + ("\n" if new_lines else ""), encoding="utf-8")
    print(f"Updated {LABELS_TXT}: removed 'hispa' if present.")


def update_contract_json():
    if not CONTRACT.exists():
        print("No contract.json found; skipping.")
        return
    data = json.loads(CONTRACT.read_text(encoding="utf-8"))
    labels = data.get("labels", [])
    if "hispa" in labels:
        data["labels"] = [lab for lab in labels if lab != "hispa"]
        CONTRACT.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"Removed 'hispa' from {CONTRACT} labels.")
    else:
        print("'hispa' not present in contract labels; nothing to change.")


def update_model_card():
    if not MODEL_CARD.exists():
        print("No MODEL_CARD.md found; skipping.")
        return
    content = MODEL_CARD.read_text(encoding="utf-8")
    new = content.replace("- `hispa`\n", "")
    if new != content:
        MODEL_CARD.write_text(new, encoding="utf-8")
        print("Removed 'hispa' from MODEL_CARD.md")
    else:
        print("No hispa entry found in MODEL_CARD.md")


def update_template():
    if not TEMPLATE.exists():
        return
    lines = TEMPLATE.read_text(encoding="utf-8").splitlines()
    new_lines = [l for l in lines if ",hispa" not in l]
    if new_lines != lines:
        TEMPLATE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        print("Removed sample hispa row from annotations.template.csv")


def main():
    filter_annotations()
    update_labels_txt()
    update_contract_json()
    update_model_card()
    update_template()


if __name__ == "__main__":
    main()
