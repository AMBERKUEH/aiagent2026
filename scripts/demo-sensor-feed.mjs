import "dotenv/config";

const DATABASE_URL = process.env.VITE_FIREBASE_DATABASE_URL;
const SENSOR_PATH = "/sensor_history";

const PROFILES = {
  normal: {
    humidity: 82,
    light_intensity: 14000,
    soil_moisture: 72,
    temperature: 31,
    water_level: 2.1,
  },
  wet_field: {
    humidity: 88,
    light_intensity: 12000,
    soil_moisture: 86,
    temperature: 30,
    water_level: 3.4,
  },
  dry_field: {
    humidity: 58,
    light_intensity: 18000,
    soil_moisture: 34,
    temperature: 35,
    water_level: 0.8,
  },
  heavy_rain_risk: {
    humidity: 91,
    light_intensity: 8000,
    soil_moisture: 90,
    temperature: 29,
    water_level: 4.0,
  },
  heat_stress: {
    humidity: 70,
    light_intensity: 22000,
    soil_moisture: 50,
    temperature: 38,
    water_level: 1.4,
  },
};

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const profileName = args.find((arg) => !arg.startsWith("--")) ?? "normal";
const profile = PROFILES[profileName];

if (!DATABASE_URL) {
  console.error(
    "Missing Firebase env config. Required for this script: VITE_FIREBASE_DATABASE_URL. " +
    "The frontend also expects the existing VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, " +
    "VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, and VITE_FIREBASE_APP_ID."
  );
  process.exit(1);
}

if (!profile) {
  console.error(`Unknown profile "${profileName}". Available profiles: ${Object.keys(PROFILES).join(", ")}`);
  process.exit(1);
}

const randomBetween = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

function withVariation(base) {
  return {
    humidity: round(clamp(base.humidity + randomBetween(-2, 2), 20, 100)),
    light_intensity: Math.round(clamp(base.light_intensity + randomBetween(-800, 800), 0, 120000)),
    soil_moisture: round(clamp(base.soil_moisture + randomBetween(-2.5, 2.5), 0, 100)),
    temperature: round(clamp(base.temperature + randomBetween(-0.8, 0.8), 15, 45)),
    water_level: round(clamp(base.water_level + randomBetween(-0.15, 0.15), 0, 50), 2),
  };
}

function buildReading({ vary = false } = {}) {
  return {
    ...(vary ? withVariation(profile) : profile),
    timestamp: new Date().toISOString(),
    source: "demo_sensor_feed",
    profile: profileName,
  };
}

async function writeReading(options = {}) {
  const reading = buildReading(options);
  const key = Date.now();
  const baseUrl = DATABASE_URL.replace(/\/$/, "");
  const url = `${baseUrl}${SENSOR_PATH}/${key}.json`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reading),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase write failed (${response.status}): ${text}`);
  }

  console.log(`[demo_sensor_feed] wrote ${profileName} reading to ${SENSOR_PATH}/${key}`);
  console.log(JSON.stringify(reading));
}

try {
  await writeReading();
  if (watch) {
    console.log("[demo_sensor_feed] watch mode active. Writing every 5 seconds. Press Ctrl+C to stop.");
    setInterval(() => {
      writeReading({ vary: true }).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
    }, 5000);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
