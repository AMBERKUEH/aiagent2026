# Demo Sensor Feed

SmartPaddy can run the existing Firebase sensor flow without a physical ESP32 by writing realistic demo readings to Firebase Realtime Database at `/sensor_history`.

This is not UI hardcoding. The app still reads from Firebase through `FarmContextProvider`, normalizes the values in `src/lib/sensors.ts`, and passes them into the orchestrator and Yield Forecast Agent.

## 1. Run the backend

The Yield Forecast Agent calls `/api/predict`, so keep the FastAPI backend running:

```bash
npm run backend:dev
```

Verify the model is ready:

```bash
curl http://127.0.0.1:8000/health
```

## 2. Run the frontend

In another terminal:

```bash
npm run dev
```

Open the Vite URL and sign in as usual.

## 3. Write one demo sensor reading

Normal paddy-field conditions:

```bash
npm run sensors:demo normal
```

Other profiles:

```bash
npm run sensors:demo wet_field
npm run sensors:demo dry_field
npm run sensors:demo heavy_rain_risk
npm run sensors:demo heat_stress
```

Profile baselines:

| Profile | Humidity | Light | Soil moisture | Temperature | Water level |
| --- | ---: | ---: | ---: | ---: | ---: |
| `normal` | 82% | 14000 lux | 72% | 31°C | 2.1 cm |
| `wet_field` | 88% | 12000 lux | 86% | 30°C | 3.4 cm |
| `dry_field` | 58% | 18000 lux | 34% | 35°C | 0.8 cm |
| `heavy_rain_risk` | 91% | 8000 lux | 90% | 29°C | 4.0 cm |
| `heat_stress` | 70% | 22000 lux | 50% | 38°C | 1.4 cm |

Each reading includes:

- `humidity`
- `light_intensity`
- `soil_moisture`
- `temperature`
- `water_level`
- `timestamp`
- `source: "demo_sensor_feed"`

## 4. Continuous demo mode

To update Firebase every 5 seconds with small realistic variation:

```bash
npm run sensors:demo -- --watch
```

You can combine a profile with watch mode:

```bash
npm run sensors:demo wet_field -- --watch
```

Stop with `Ctrl+C`.

## 5. Verify Firebase received data

Open Firebase Console:

1. Select the SmartPaddy project.
2. Go to Realtime Database.
3. Open `/sensor_history`.
4. Confirm new timestamp-keyed entries appear with `source: "demo_sensor_feed"`.

In the app, the Today page should show a subtle label:

```text
Sensor source: Demo Sensor Feed
```

## 6. Unlock the What-if Farm Simulator

After the demo sensor feed writes complete readings:

1. Keep backend running.
2. Keep frontend running.
3. Go to Today.
4. Run or wait for the AI Agent Cycle.
5. Go to `/scenarios`.

If the backend yield model is ready and market/weather calls succeed, the What-if Farm Simulator should unlock using real FarmContext outputs rather than demo-hardcoded numbers.

## 7. Switch to real ESP32 later

Configure the ESP32 to write to the same Firebase path:

```text
/sensor_history
```

Use the same field names where possible:

```json
{
  "humidity": 82,
  "light_intensity": 14000,
  "soil_moisture": 72,
  "temperature": 31,
  "water_level": 2.1,
  "timestamp": "2026-05-08T06:00:00.000Z",
  "source": "esp32_sensor_feed"
}
```

SmartPaddy validates plausible sensor ranges before agents use the values. For example, `temperature: 0` is treated as offline/null instead of “optimal.”
