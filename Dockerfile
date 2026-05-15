# Stage 1: Build the frontend
FROM node:20-slim AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Explicitly write the .env file in the container to bypass upload/ignore issues
# Added VITE_USE_MOCK_MARKET=true to ensure recommendation generation is not blocked by missing market APIs
RUN echo "VITE_GROQ_API_KEY=" > .env
RUN echo "VITE_FIREBASE_API_KEY=AIzaSyCz5Tzl_5TjOeeJF14dtvIKlwGmIqAhjag" >> .env
RUN echo "VITE_FIREBASE_AUTH_DOMAIN=smartpaddy-my.firebaseapp.com" >> .env
RUN echo "VITE_FIREBASE_PROJECT_ID=smartpaddy-my" >> .env
RUN echo "VITE_FIREBASE_DATABASE_URL=https://smartpaddy-my-default-rtdb.asia-southeast1.firebasedatabase.app" >> .env
RUN echo "VITE_FIREBASE_STORAGE_BUCKET=smartpaddy-my.firebasestorage.app" >> .env
RUN echo "VITE_FIREBASE_MESSAGING_SENDER_ID=94357340153" >> .env
RUN echo "VITE_FIREBASE_APP_ID=1:94357340153:web:66c40bf117618d9f050728" >> .env
RUN echo "VITE_SUPABASE_URL=https://nmgumyfhrcquvafyrovu.supabase.co" >> .env
RUN echo "VITE_SUPABASE_ANON_KEY=sb_publishable_1yWzLcobOii454vjJ0AIzg_MW1CPD0d" >> .env
RUN echo "VITE_USE_MOCK_MARKET=true" >> .env

# Vite sometimes requires .env.production for the production build
RUN cp .env .env.production

RUN npm run build

# Stage 2: Build the backend
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend code
COPY backend/ ./backend/

# Copy the built frontend
COPY --from=build-stage /app/dist ./dist

# Set environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

# Run the server
CMD uvicorn backend.server:app --host 0.0.0.0 --port ${PORT}
