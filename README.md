# SmartPaddy 🌾

SmartPaddy is an AI-powered precision farming platform designed to empower Malaysian rice farmers. By integrating IoT sensor telemetry, satellite data, and machine learning, SmartPaddy helps farmers optimize yields, detect diseases early, and manage agricultural risks.

---

## 🚀 Live Production Deployment

SmartPaddy is optimized for deployment on **Google Cloud Run**, featuring a unified containerized architecture.

### Deployment Instructions

1.  **Build and Deploy**:
    Ensure you have the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and authenticated.
    ```bash
    gcloud run deploy paddy-app --source . --region asia-southeast1 --allow-unauthenticated
    ```
2.  **Environment Variables**:
    Ensure your `.env` variables (Firebase, Groq, Supabase) are present in the project root. The `.gcloudignore` file is configured to include them during the build process to bake them into the frontend.

---

## 🌟 Key Features

- **Unified Dashboard**: Real-time monitoring of soil moisture, temperature, humidity, light intensity, and water levels via Firebase.
- **AI Yield Forecasting**: Advanced Scikit-learn/XGBoost models predicting crop output based on environmental conditions.
- **Leaf Disease Scanner**: Edge-optimized TFLite Computer Vision model (EfficientNetB0) detecting diseases like Bacterial Blight and Blast.
- **Bilingual AI Agronomist**: LLM-powered chatbot (Groq/Llama-3) providing disease-specific advice and document retrieval.
- **Precision Map Overlay**: Geographical risk assessment and supplier tracking for Malaysian granary zones.

---

## 🛠️ Architecture & Tech Stack

### Frontend
- **Framework**: React 18 (Vite)
- **Styling**: Tailwind CSS / Shadcn UI
- **State/Data**: Firebase Realtime Database, Supabase

### Backend (Unified Serving)
- **Engine**: FastAPI (Python 3.11)
- **Serving**: The production container serves the Vite `dist` folder directly, eliminating the need for a separate frontend host.
- **Inference**: 
  - `tflite-runtime` for lightweight Computer Vision inference.
  - `joblib`/`xgboost` for crop yield prediction.

---

## 📦 Technical Setup (Local Development)

### 1. Prerequisites
- Node.js 18+
- Python 3.11+

### 2. Installation
```bash
# Install frontend & workspace tools
npm install

# Install backend dependencies
pip install -r requirements.txt
```

### 3. Environment Config
Clone `.env.example` to `.env` and fill in your API keys (Groq, Firebase, Supabase).

### 4. Running Locally
- **Frontend (Dev)**: `npm run dev`
- **Backend (Dev)**: `npm run backend:dev` (runs on port 8000)

---

## 🗺️ Future Roadmap
- **Nutrient Prescription**: Automated fertilizer dosage based on soil sensor history.
- **Lesion Localization**: Move from classification to YOLO-based disease localization.
- **Weather-Index Insurance**: Automated risk-based insurance triggers for rainfed areas.

---

*Built for the Food Security / Smart Agriculture domain.*
