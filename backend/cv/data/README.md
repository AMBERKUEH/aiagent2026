# SmartPaddy CV Dataset Workspace

Use this folder for the Person 1 image classification pipeline.

Primary source dataset:

- `Rice Leaf Disease Images` on Kaggle
- Source: 
    1. `https://www.kaggle.com/datasets/nirmalsankalana/rice-leaf-disease-image`
    2. `https://www.kaggle.com/datasets/nizorogbezuode/rice-leaf-images`
    3. `https://www.kaggle.com/datasets/rajkumar898/rice-plant-dataset`

## Expected files

- `annotations.csv`: your real dataset manifest
- `annotations.template.csv`: starter schema
- `images/`: local image files referenced by the manifest
- `healthy_samples/`: your healthy leaf source images before import

## Required columns

- `image_id`
- `file_path`
- `label_primary`

## Optional columns

- `split`
- `growth_stage`
- `lighting`
- `distance_cm`
- `device_model`
- `field_id`
- `geo_region`
- `severity_0_3`
- `verified_by_expert`

## Label set

- `healthy`
- `bacterial_blight`
- `blast`
- `brown_spot`
- `hispa`
- `tungro`
