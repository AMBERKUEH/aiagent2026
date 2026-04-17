# SmartPaddy

SmartPaddy is an AI-powered precision farming platform built to help Malaysian rice farmers improve productivity, reduce losses, and make better decisions using real-time field data.

---

## Project Overview

SmartPaddy combines IoT sensor monitoring, machine learning prediction, and a mobile-friendly dashboard to support smarter irrigation, fertilization, and risk management. The platform is especially focused on **rainfed paddy areas**, where drought, erratic rainfall, and soil degradation significantly affect yield and farmer livelihoods.

The project aligns with the **Food Security** theme and falls under the **Smart Agriculture** domain.

### Current Modules

- **Live Dashboard**  
  Displays real-time sensor readings such as soil moisture, temperature, humidity, light intensity, and water level.

- **AI Yield Prediction**  
  Sends sensor data to a FastAPI machine learning endpoint to estimate crop yield.

- **Computer Vision Build Track (Person 1)**  
  Includes a real backend pipeline for rice-leaf image classification using `EfficientNetB0`, covering Kaggle dataset import, validation, split generation, training/export scaffolding, and TFLite inference hooks.

- **Bilingual Farming Assistant Chat**  
  Provides sensor-aware responses and retrieves relevant information from agriculture documents.

- **Market Intelligence**  
  Supports fertilizer price comparison and selling simulations.

- **Interactive Malaysia Map**  
  Shows risk zones, supplier locations, and crop suitability insights.

---

## Installation / Setup Guide

### Prerequisites

Make sure the following are installed on your machine:

- Node.js 18 or newer
- npm
- Python 3.11 or newer
- pip

### 1. Clone the project

```bash
git clone https://github.com/NgRRou/smart-paddy.git
cd smart-paddy
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the project root. You can copy the example values from `.env.example`.

Required frontend environment variables:

```env
VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 4. Install backend dependencies

Install the Python packages used by the backend:

```bash
pip install fastapi uvicorn pandas joblib scikit-learn pydantic pillow numpy xgboost
```

### 5. Run the backend server

Start the FastAPI prediction API on port `8000`:

```bash
npm run backend:dev
```

The API will be available at:

```text
http://127.0.0.1:8000
```

### 5a. Optional: Set up the Person 1 computer vision pipeline

Install the CV-specific dependencies:

```bash
pip install -r backend/requirements-cv.txt
```

Prepare the dataset workspace:

```bash
python -m backend.cv.cli init-workspace
```

Then:

1. Run `npm run cv:init`
2. Run `npm run cv:fetch-kaggle`
3. Run `npm run cv:fetch-kaggle-healthy`
4. Add your healthy images to `backend/cv/data/healthy_samples/`, then run: `python -m backend.cv.cli import-healthy --source-dir "backend/cv/data/healthy_samples"`
5. Run `npm run cv:validate`
6. Optional quick check: `npm run cv:train:smoke`
7. Full training: `npm run cv:train`
8. Test the exported model: `npm run cv:test`

Notes:

- `cv:fetch-kaggle` downloads `nirmalsankalana/rice-leaf-disease-image` and auto-imports it into `backend/cv/data/annotations.csv`
- `cv:fetch-kaggle-healthy` downloads `nizorogbezuode/rice-leaf-images` and merges mapped classes into the same manifest.
- The first Kaggle source is disease-only, while the second adds `healthy`; importing your own healthy images is still recommended for local field conditions.
- If Kaggle auth is missing, set your Kaggle API credentials first (`kaggle.json`) then rerun.
- Put ad-hoc real-world test images in `backend/cv/data/inference_samples/` (recommended), not in the training manifest.
- If you want to force a specific image: `python -m backend.cv.cli test-model --image "path\\to\\image.jpg"`

Useful CV endpoints after a model is exported:

```text
GET  /cv/health
GET  /cv/spec
POST /cv/predict
```

### 6. Run the frontend app

Start the Vite development server:

```bash
npm run dev
```

The frontend will run at:

```text
http://localhost:8080
```

## Technologies Used

### Hardware
- ESP32 microcontroller
- Soil moisture sensor
- Water level sensor
- DHT11 Temperature and Humidity Sensor
- Photoresistor

### Frontend

- Lovable
- React
- TypeScript
- Vite
- Tailwind CSS

### Backend

- FastAPI
- Uvicorn
- Pandas
- Joblib
- Pydantic
- Scikit-learn model bundle for crop yield prediction
- SmartPaddy CV package for dataset validation, EfficientNetB0 training, TFLite export, and image inference

### Data / Integrations

- Firebase Realtime Database for live sensor readings
- Firebase Firestore initialization support
- Supabase for agriculture knowledge retrieval
- Groq API for chatbot responses

### Testing / Tooling

- ESLint
- Vitest
- Playwright

## Future Roadmap

- Advanced fertilizer and soil amendment guidance: Expand from simple nutrient alerts to more precise fertilizer dosage recommendations, including lime application for acidic soil and gypsum recommendations for saline fields.
- Move the CV pipeline from classification to lesion localization after the dataset is mature enough for YOLO-based detection.
- Smart insurance and resilience features: Introduce weather-index insurance concepts where drought or flood risk thresholds can trigger automated support, claim recommendations or resilience planning for farmers in rainfed areas.
