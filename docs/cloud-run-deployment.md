# Cloud Run Deployment

This project deploys as one Docker container: FastAPI serves `/api/*` and the built Vite app from `dist/`.

Do not commit `.env` or real secret values. Use `.env.example` only for placeholder names.

## What Is Secret

Store these in Google Secret Manager and inject them into Cloud Run at runtime:

- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `OPENWEATHERMAP_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_S3_SECRET_ACCESS_KEY`

These browser config values are not server secrets, but they are still kept out of Git and out of the image. Cloud Run injects them at runtime and the container writes `/env.js` when it starts:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MARKET_API_URL`
- `VITE_USE_MOCK_MARKET`

## One-Time Google Cloud Setup

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories create smartpaddy \
  --repository-format=docker \
  --location=REGION \
  --description="SmartPaddy containers"

gcloud auth configure-docker REGION-docker.pkg.dev
```

## Create Secrets

Create the secret containers once:

```bash
gcloud secrets create groq-api-key --replication-policy=automatic
gcloud secrets create gemini-api-key --replication-policy=automatic
gcloud secrets create openweathermap-api-key --replication-policy=automatic
gcloud secrets create supabase-service-role-key --replication-policy=automatic
gcloud secrets create supabase-s3-secret-access-key --replication-policy=automatic
```

Add secret versions without putting values in Git or deployment commands. Use the Google Cloud Console Secret Manager UI, or use stdin:

```bash
gcloud secrets versions add groq-api-key --data-file=-
gcloud secrets versions add gemini-api-key --data-file=-
gcloud secrets versions add openweathermap-api-key --data-file=-
gcloud secrets versions add supabase-service-role-key --data-file=-
gcloud secrets versions add supabase-s3-secret-access-key --data-file=-
```

When using `--data-file=-`, paste the value into the terminal input when prompted, then end stdin for your shell.

## Build And Push

Use an immutable tag so Cloud Run cannot accidentally reuse an old `latest` image.

```bash
export PROJECT_ID=your-project-id
export REGION=asia-southeast1
export REPOSITORY=smartpaddy
export SERVICE=smartpaddy
export IMAGE="REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/SERVICE:$(git rev-parse --short HEAD)"

docker build -t "$IMAGE" .
docker push "$IMAGE"
```

PowerShell equivalent:

```powershell
$PROJECT_ID="your-project-id"
$REGION="asia-southeast1"
$REPOSITORY="smartpaddy"
$SERVICE="smartpaddy"
$TAG=(git rev-parse --short HEAD)
$IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$SERVICE`:$TAG"

docker build -t $IMAGE .
docker push $IMAGE
```

## Deploy To Cloud Run

Replace placeholder values before running. Do not paste server secret values into `--set-env-vars`; use `--set-secrets`.

```bash
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars VITE_FIREBASE_API_KEY="firebase-web-api-key-placeholder",VITE_FIREBASE_AUTH_DOMAIN="project.firebaseapp.com",VITE_FIREBASE_PROJECT_ID="firebase-project-id",VITE_FIREBASE_DATABASE_URL="https://project-default-rtdb.firebaseio.com",VITE_FIREBASE_STORAGE_BUCKET="project.appspot.com",VITE_FIREBASE_MESSAGING_SENDER_ID="sender-id",VITE_FIREBASE_APP_ID="firebase-app-id",VITE_SUPABASE_URL="https://project-ref.supabase.co",VITE_SUPABASE_ANON_KEY="supabase-anon-placeholder",VITE_USE_MOCK_MARKET="false" \
  --set-secrets GROQ_API_KEY=groq-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest,OPENWEATHERMAP_API_KEY=openweathermap-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,SUPABASE_S3_SECRET_ACCESS_KEY=supabase-s3-secret-access-key:latest
```

For later secret-only updates:

```bash
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --update-secrets GROQ_API_KEY=groq-api-key:latest,GEMINI_API_KEY=gemini-api-key:latest,OPENWEATHERMAP_API_KEY=openweathermap-api-key:latest
```

For public runtime config updates:

```bash
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --update-env-vars VITE_USE_MOCK_MARKET="false"
```

## Pre-Deploy Safety Checks

Run these before building:

```bash
git ls-files .env .env.*
git status --short
rg -n --glob '!node_modules/**' --glob '!dist/**' --glob '!*.log' --glob '!.env*' "AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|service[_-]role|postgres(ql)?://|mongodb(\\+srv)?://" .
```

Expected result:

- `git ls-files .env .env.*` prints nothing.
- `rg ...` prints nothing.
- `git status --short` only shows intended source/documentation changes.

References:

- Cloud Run deploy flags: https://cloud.google.com/sdk/gcloud/reference/run/deploy
- Cloud Run secrets: https://cloud.google.com/run/docs/configuring/services/secrets
- Artifact Registry Docker push: https://cloud.google.com/artifact-registry/docs/docker/pushing-and-pulling
