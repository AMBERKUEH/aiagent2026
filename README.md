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
pip install fastapi uvicorn pandas joblib scikit-learn pydantic
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
- Pest and disease detection: Add image-based disease and pest recognition using smartphone photos and computer vision models to improve early intervention.
- Smart insurance and resilience features: Introduce weather-index insurance concepts where drought or flood risk thresholds can trigger automated support, claim recommendations or resilience planning for farmers in rainfed areas.