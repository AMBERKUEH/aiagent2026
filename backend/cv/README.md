# SmartPaddy Person 1 Computer Vision Pipeline

This package implements the Person 1 build track as real project code instead of presentation-only UI.

## What is included

- Fixed MVP taxonomy for rice leaf classification using the Kaggle `Rice Leaf Disease Images` dataset
- Dataset manifest validation and quality checks
- Train/validation/test split generation
- EfficientNetB0 transfer learning with pure TensorFlow/Keras + INT8 TFLite export
- Frozen golden-set export for regression checks
- FastAPI-ready TFLite inference helpers

## Quick start

1. Install the optional CV dependencies:

```bash
pip install -r backend/requirements-cv.txt
```

2. Prepare the dataset workspace:

```bash
python -m backend.cv.cli init-workspace
```

3. Download and import the first Kaggle dataset (disease-focused):

```bash
python -m backend.cv.cli fetch-kaggle --import-data
```

4. Download and import the second Kaggle dataset (adds healthy and more diversity):

```bash
python -m backend.cv.cli fetch-kaggle --dataset-slug "nizorogbezuode/rice-leaf-images" --import-data
```

5. Import your own healthy images (recommended):

```bash
python -m backend.cv.cli import-healthy --source-dir "backend/cv/data/healthy_samples"
```

6. Validate the manifest:

```bash
python -m backend.cv.cli validate-dataset
```

7. Train and export the classifier:

```bash
python -m backend.cv.cli train --epochs 20 --batch-size 16
```

8. Test the model export:

```bash
python -m backend.cv.cli test-model
```

If you prefer manual import, use:

```bash
python -m backend.cv.cli import-kaggle --source-dir "C:\path\to\rice-leaf-disease-image"
```

## Where to put test images

- For unbiased ad-hoc testing, place images in `backend/cv/data/inference_samples/`.
- Do not add those images to `annotations.csv` unless you intend to retrain with them.
- `test-model` uses a provided `--image` first, then falls back to files in `inference_samples/`, then to the generated test split.

6. Run local inference after export:

```bash
python -m backend.cv.cli predict --image backend/cv/data/images/your-leaf.jpg
```

## Deployable outputs

The active export is published to `backend/cv/artifacts/current/`:

- `model.tflite`
- `labels.txt`
- `contract.json`
- `MODEL_CARD.md`

## Kaggle label mapping

- `Bacterialblight` -> `bacterial_blight`
- `Blast` -> `blast`
- `Leaf Blast` -> `blast`
- `Brownspot` -> `brown_spot`
- `Hispa` or `_Hispa` -> `hispa`
- `Tungro` -> `tungro`
- `Healthy` -> `healthy`

## Final training classes

- `healthy`
- `bacterial_blight`
- `blast`
- `brown_spot`
- `hispa`
- `tungro`
