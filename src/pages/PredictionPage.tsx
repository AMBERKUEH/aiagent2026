import AppLayout from "@/components/AppLayout";
import { rtdb } from "@/lib/firebase";
import { normalizeSensorPayload, type NormalizedSensors } from "@/lib/sensors";
import { onValue, ref } from "firebase/database";
import { useEffect, useMemo, useState } from "react";

type SensorSnapshot = {
  humidity: number | null;
  lightIntensity: number | null;
  soilMoisture: number | null;
  temperature: number | null;
  waterLevel: number | null;
  timestamp: string | null;
  sourceKeys: string[];
  sourcePath: string | null;
};

type PredictionResponse = {
  prediction: number;
  confidence: number;
  test_r2: number;
  features: Record<string, number>;
};

const initialSensors: SensorSnapshot = {
  humidity: null,
  lightIntensity: null,
  soilMoisture: null,
  temperature: null,
  waterLevel: null,
  timestamp: null,
  sourceKeys: [],
  sourcePath: null,
};

const formatReading = (value: number | null, suffix = "") =>
  value === null ? "--" : `${value.toFixed(1)}${suffix}`;

const formatLiveTimestamp = (timestamp: string | null, now: Date) => {
  if (!timestamp) {
    return now.toLocaleString();
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return now.toLocaleString();
  }

  const diffMs = Math.max(0, now.getTime() - parsed.getTime());
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return `${parsed.toLocaleString()} (${diffSeconds}s ago)`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${parsed.toLocaleString()} (${diffMinutes}m ago)`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  return `${parsed.toLocaleString()} (${diffHours}h ago)`;
};

const getRiskLabel = (prediction: number) => {
  if (prediction >= 6.5) return "Minimal Risk";
  if (prediction >= 5) return "Moderate Risk";
  return "High Risk";
};

const buildRecommendation = (sensors: SensorSnapshot, prediction: number) => {
  const actions: string[] = [];

  if (sensors.soilMoisture !== null && sensors.soilMoisture < 45) {
    actions.push("Increase irrigation soon because soil moisture is below the model's comfortable range.");
  } else if (sensors.soilMoisture !== null && sensors.soilMoisture > 80) {
    actions.push("Drain excess standing water to reduce root stress before the next growth window.");
  } else {
    actions.push("Keep the current irrigation rhythm steady because soil moisture is in a workable range.");
  }

  if (sensors.humidity !== null && sensors.humidity > 85) {
    actions.push("Monitor for fungal pressure because relative humidity is elevated.");
  }

  if (sensors.temperature !== null && sensors.temperature > 33) {
    actions.push("Watch midday heat stress and avoid unnecessary field operations during peak temperature.");
  }

  if (prediction >= 6.5) {
    actions.push("Current conditions are aligned with a stronger yield outcome if the trend is maintained.");
  } else if (prediction >= 5) {
    actions.push("Yield outlook is recoverable, but tighter water and crop-health monitoring would help.");
  } else {
    actions.push("Yield outlook is under pressure, so field inspection and corrective action should be prioritized.");
  }

  return actions.join(" ");
};

const PredictionPage = () => {
  const [showResults, setShowResults] = useState(false);
  const [sensors, setSensors] = useState<SensorSnapshot>(initialSensors);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveNow, setLiveNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLiveNow(new Date());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const candidatePaths = ["/sensor_history"];
    let bestMatch: (NormalizedSensors & { sourcePath: string }) | null = null;

    const unsubscribes = candidatePaths.map((path) =>
      onValue(
        ref(rtdb, path),
        (snapshot) => {
          const normalized = normalizeSensorPayload(snapshot.val() ?? {});
          const candidate = { ...normalized, sourcePath: path };

          if (!candidate.hasAnySensorValue) {
            if (!bestMatch) {
              setSensors((current) => ({
                ...current,
                sourcePath: current.sourcePath ?? path,
              }));
            }
            return;
          }

          if (!bestMatch || candidate.sourceKeys.length >= bestMatch.sourceKeys.length) {
            bestMatch = candidate;
            setSensors({
              humidity: candidate.humidity,
              lightIntensity: candidate.lightIntensity,
              soilMoisture: candidate.soilMoisture,
              temperature: candidate.temperature,
              waterLevel: candidate.waterLevel,
              timestamp: candidate.timestamp,
              sourceKeys: candidate.sourceKeys,
              sourcePath: candidate.sourcePath,
            });
            setError(null);
          }
        },
        () => {
          setError("Unable to read live sensor values from Firebase.");
        }
      )
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const missingFields = useMemo(() => {
    const required = [
      ["humidity", sensors.humidity],
      ["light_intensity", sensors.lightIntensity],
      ["soil_moisture", sensors.soilMoisture],
      ["temperature", sensors.temperature],
      ["water_level", sensors.waterLevel],
    ] as const;

    return required.filter(([, value]) => value === null).map(([name]) => name);
  }, [sensors]);

  const runPrediction = async () => {
    if (missingFields.length > 0) {
      setError(`Missing sensor values: ${missingFields.join(", ")}`);
      setShowResults(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          humidity: sensors.humidity,
          light_intensity: sensors.lightIntensity,
          soil_moisture: sensors.soilMoisture,
          temperature: sensors.temperature,
          water_level: sensors.waterLevel,
          waterLevel: sensors.waterLevel,
        }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errorData = await response.json();
          detail = errorData.detail ? `: ${errorData.detail}` : "";
        } catch {
          try {
            const errorText = await response.text();
            detail = errorText ? `: ${errorText}` : "";
          } catch {
            detail = "";
          }
        }
        throw new Error(`Prediction request failed with status ${response.status}${detail}`);
      }

      const data: PredictionResponse = await response.json();
      setPrediction(data);
      setShowResults(true);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Prediction request failed.";
      setError(message);
      setShowResults(false);
    } finally {
      setIsLoading(false);
    }
  };

  const riskLabel = prediction ? getRiskLabel(prediction.prediction) : "Pending";
  const recommendation = prediction ? buildRecommendation(sensors, prediction.prediction) : "";
  const lastScan = formatLiveTimestamp(sensors.timestamp, liveNow);

  return (
    <AppLayout>
      <div className="space-y-10 max-w-5xl mx-auto">
        {/* Header */}
        <section className="space-y-3">
          <h2 className="font-headline text-4xl font-bold tracking-[0.05em] text-primary">AI Yield Prediction</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed max-w-md">
            Leveraging satellite imagery and soil sensor telemetry to forecast paddy harvest output with clinical precision.
          </p>
        </section>

        {/* Run Button */}
        <section className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0_8px_32px_rgba(25,28,29,0.02)] flex justify-center">
          <button
            onClick={runPrediction}
            disabled={isLoading}
            className="bg-primary text-primary-foreground px-10 py-4 rounded-xl font-medium text-sm tracking-wide transition-all hover:opacity-90 active:scale-95 uppercase"
          >
            {isLoading ? "Running..." : "Run Prediction"}
          </button>
        </section>

        {/* Satellite Image */}
        <section className="rounded-2xl overflow-hidden relative shadow-[0_8px_32px_rgba(25,28,29,0.04)]">
          <img
            className="w-full h-56 object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCjnocp_2-_2Yz6e91yl32Bj9G1DxW3x7DZZdBdBjSto2xEqplZ2lXmE2LWOvsIbBM3B1lTkmdXHV6-M6PKhXFVGNxgyD514ceY_C1PHQatwh9EjM1A9uJiZprubdFa9SzBdKNFIs03PqA6NvCiNADI5KU53N8qtqI4ldW4lbj6NvKV-B3ILHkDXZpoGpj7ETX6IFITpRrElW0LmEve9Qz4h_eU0P5Ge1Lk6VHtExFdricxE7SZO2L5r6o4BnS0NABUHGE9oBVJ1Akl"
            alt="Satellite scan"
          />
          <div className="absolute bottom-4 left-4">
            <span className="text-[10px] uppercase tracking-widest text-primary-foreground/70 block">Last Scan</span>
            <span className="text-sm font-bold text-primary-foreground">{lastScan}</span>
          </div>
        </section>

        <section className="bg-surface-container-lowest p-6 rounded-2xl shadow-[0_8px_32px_rgba(25,28,29,0.02)]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-outline block mb-1">Humidity</span>
              <span className="text-lg font-bold text-primary">{formatReading(sensors.humidity, "%")}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-outline block mb-1">Light Intensity</span>
              <span className="text-lg font-bold text-primary">{formatReading(sensors.lightIntensity, " lux")}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-outline block mb-1">Soil Moisture</span>
              <span className="text-lg font-bold text-primary">{formatReading(sensors.soilMoisture, "%")}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-outline block mb-1">Temperature</span>
              <span className="text-lg font-bold text-primary">{formatReading(sensors.temperature, "°C")}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest text-outline block mb-1">Water Level</span>
              <span className="text-lg font-bold text-primary">{formatReading(sensors.waterLevel, " cm")}</span>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
          {!error && missingFields.length > 0 && (
            <p className="text-sm text-on-surface-variant mt-4">
              Waiting for complete Firebase readings: {missingFields.join(", ")}
            </p>
          )}
          {/* {sensors.sourceKeys.length > 0 && (
            <p className="text-xs text-on-surface-variant mt-2">
              Sensor keys detected from {sensors.sourcePath}: {sensors.sourceKeys.join(", ")}
            </p>
          )} */}
          {sensors.sourceKeys.length === 0 && (
            <p className="text-xs text-on-surface-variant mt-2">
              No matching sensor keys found yet. Checked path: /sensor_history
            </p>
          )}
        </section>

        {showResults && (
          <>
            {/* Yield Result */}
            <section className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0_8px_32px_rgba(25,28,29,0.02)] text-center space-y-4">
              <span className="inline-block bg-on-tertiary-container/20 text-on-tertiary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                System Analysis Complete
              </span>
              <h3 className="font-headline text-5xl font-extrabold text-primary">
                {prediction?.prediction.toFixed(2)} <span className="text-lg font-normal">t/ha</span>
              </h3>
              <div>
                <span className="text-[10px] uppercase tracking-widest text-outline block mb-2">Risk Label</span>
                <span className="inline-block bg-on-surface text-surface-container-lowest px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
                  {riskLabel}
                </span>
              </div>
              <div className="pt-4">
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-on-surface-variant">Confidence Score</span>
                  <span className="text-xs font-bold text-primary">{prediction?.confidence}%</span>
                </div>
                <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${prediction?.confidence ?? 0}%` }}
                  />
                </div>
              </div>
            </section>

            {/* Agronomic Recommendation */}
            <section className="bg-surface-container-lowest p-8 rounded-2xl shadow-[0_8px_32px_rgba(25,28,29,0.02)] space-y-6">
              <h4 className="font-headline text-lg font-semibold text-primary">Agronomic Recommendation</h4>
              <div className="border-l-2 border-primary/20 pl-6">
                <p className="text-sm text-on-surface-variant leading-relaxed italic">
                  {recommendation}
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-surface-container-low px-4 py-3 rounded-xl">
                  <span className="material-symbols-outlined text-primary text-lg">water_drop</span>
                  <span className="text-xs font-medium text-on-surface uppercase tracking-wider">
                    Irrigation: {sensors.soilMoisture !== null && sensors.soilMoisture < 45 ? "Increase" : "Steady"}
                  </span>
                </div>
                <div className="flex items-center gap-3 bg-surface-container-low px-4 py-3 rounded-xl">
                  <span className="material-symbols-outlined text-primary text-lg">science</span>
                  <span className="text-xs font-medium text-on-surface uppercase tracking-wider">
                    Humidity: {formatReading(sensors.humidity, "%")}
                  </span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default PredictionPage;
