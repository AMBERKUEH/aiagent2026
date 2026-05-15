#!/bin/sh
set -eu

python - <<'PY'
import json
import os
from pathlib import Path

public_keys = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_DATABASE_URL",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_MARKET_API_URL",
    "VITE_USE_MOCK_MARKET",
]

config = {key: os.environ[key] for key in public_keys if os.environ.get(key)}
target = Path("/app/dist/env.js")
target.write_text(
    "window.__SMARTPADDY_CONFIG__ = " + json.dumps(config, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
PY

exec "$@"
