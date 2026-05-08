import AppLayout from "@/components/AppLayout";
import { rtdb } from "@/lib/firebase";
import { normalizeSensorPayload, type NormalizedSensors } from "@/lib/sensors";
import { onValue, ref } from "firebase/database";
import { useEffect, useMemo, useState } from "react";
import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

type DashboardSensors = {
  humidity: number | null;
  lightIntensity: number | null;
  soilMoisture: number | null;
  temperature: number | null;
  waterLevel: number | null;
  timestamp: string | null;
  sourcePath: string | null;
};

const initialSensors: DashboardSensors = {
  humidity: null,
  lightIntensity: null,
  soilMoisture: null,
  temperature: null,
  waterLevel: null,
  timestamp: null,
  sourcePath: null,
};

const formatValue = (value: number | null, suffix = "") =>
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

type TrendPoint = {
  label: string;
  soilMoisture: number;
  temperature: number;
  timestampMs: number;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toTimestampMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e11 ? value : value * 1000;
  }

  if (typeof value === "string" && value.trim()) {
    const direct = Date.parse(value);
    if (Number.isFinite(direct)) return direct;

    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) return numeric > 1e11 ? numeric : numeric * 1000;
  }

  return null;
};

const getValueByAliases = (entry: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const direct = entry[alias];
    const parsed = toNumber(direct);
    if (parsed !== null) return parsed;

    const key = Object.keys(entry).find((candidate) => candidate.toLowerCase() === alias.toLowerCase());
    if (!key) continue;

    const fallback = toNumber(entry[key]);
    if (fallback !== null) return fallback;
  }

  return null;
};

const getTimestampByAliases = (entry: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const direct = entry[alias];
    const parsed = toTimestampMs(direct);
    if (parsed !== null) return parsed;

    const key = Object.keys(entry).find((candidate) => candidate.toLowerCase() === alias.toLowerCase());
    if (!key) continue;

    const fallback = toTimestampMs(entry[key]);
    if (fallback !== null) return fallback;
  }

  return null;
};

const getSensorPill = (
  kind: "soil" | "temperature" | "humidity" | "light" | "water",
  value: number | null
) => {
  if (kind === "light") {
    return { label: "Live", className: "bg-sky-100 text-sky-700" };
  }

  if (value === null) {
    return { label: "No Data", className: "bg-slate-100 text-slate-500" };
  }

  if (value === 0) {
    return { label: "Error", className: "bg-red-100 text-red-700" };
  }

  if (kind === "soil") {
    if (value >= 65 && value <= 80) return { label: "Optimal", className: "bg-green-100 text-green-700" };
    if (value > 80) return { label: "Saturated", className: "bg-yellow-100 text-yellow-700" };
    if (value >= 45) return { label: "Dry", className: "bg-yellow-100 text-yellow-700" };
    return { label: "Critical", className: "bg-red-100 text-red-700" };
  }

  if (kind === "temperature") {
    if (value <= 33) return { label: "Optimal", className: "bg-green-100 text-green-700" };
    if (value <= 35) return { label: "Warm", className: "bg-yellow-100 text-yellow-700" };
    return { label: "Heat Stress", className: "bg-red-100 text-red-700" };
  }

  if (kind === "humidity") {
    if (value >= 60 && value <= 80) return { label: "Optimal", className: "bg-green-100 text-green-700" };
    if (value <= 90) return { label: "Humid", className: "bg-yellow-100 text-yellow-700" };
    return { label: "Fungal Risk", className: "bg-red-100 text-red-700" };
  }

  if (kind === "water") {
    if (value > 2) return { label: "Flooded", className: "bg-green-100 text-green-700" };
    if (value >= 1) return { label: "Low", className: "bg-yellow-100 text-yellow-700" };
    return { label: "Dry Bed", className: "bg-red-100 text-red-700" };
  }

  return { label: "Live", className: "bg-slate-100 text-slate-500" };
};

const DashboardPage = () => {
  const [sensors, setSensors] = useState<DashboardSensors>(initialSensors);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);

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
      onValue(ref(rtdb, path), (snapshot) => {
        const normalized = normalizeSensorPayload(snapshot.val() ?? {});
        const candidate = { ...normalized, sourcePath: path };

        if (!candidate.hasAnySensorValue) return;

        if (!bestMatch || candidate.sourceKeys.length >= bestMatch.sourceKeys.length) {
          bestMatch = candidate;
          setSensors({
            humidity: candidate.humidity,
            lightIntensity: candidate.lightIntensity,
            soilMoisture: candidate.soilMoisture,
            temperature: candidate.temperature,
            waterLevel: candidate.waterLevel,
            timestamp: candidate.timestamp,
            sourcePath: candidate.sourcePath,
          });
        }
      })
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    const historyRef = ref(rtdb, "/sensor_history");

    return onValue(historyRef, (snapshot) => {
      const raw = snapshot.val();
      if (!raw || typeof raw !== "object") {
        setTrendData([]);
        return;
      }

      const parsed = Object.values(raw as Record<string, unknown>)
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
        .map((entry, index) => {
          const temperature = getValueByAliases(entry, ["temperature", "temp", "air_temperature"]);
          const soilMoisture = getValueByAliases(entry, ["soil_moisture", "soilMoisture", "soilHumidity", "moisture", "soil"]);
          const timestampMs = getTimestampByAliases(entry, ["timestamp", "updated_at", "last_updated", "created_at", "time"]) ?? index;

          return { temperature, soilMoisture, timestampMs };
        })
        .filter(
          (entry): entry is { temperature: number; soilMoisture: number; timestampMs: number } =>
            entry.temperature !== null && entry.soilMoisture !== null
        )
        .sort((left, right) => left.timestampMs - right.timestampMs)
        .slice(-20)
        .map((entry) => ({
          ...entry,
          label: new Date(entry.timestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }));

      setTrendData(parsed);
    });
  }, []);

  const cropStatus = useMemo(() => {
    if (sensors.soilMoisture === null || sensors.temperature === null) return "Waiting for Data";
    if (sensors.soilMoisture >= 65 && sensors.soilMoisture <= 80 && sensors.temperature <= 33) return "Healthy";
    if (sensors.soilMoisture < 45 || sensors.temperature > 35) return "Needs Attention";
    return "Stable";
  }, [sensors.soilMoisture, sensors.temperature]);

  const statusStyle = useMemo(() => {
    if (cropStatus === "Healthy") {
      return {
        card: "border border-emerald-200 bg-white",
        label: "text-emerald-700",
        dot: "bg-emerald-500",
      };
    }

    if (cropStatus === "Stable") {
      return {
        card: "border border-amber-200 bg-white",
        label: "text-amber-700",
        dot: "bg-amber-400",
      };
    }

    if (cropStatus === "Needs Attention") {
      return {
        card: "border border-yellow-200 bg-white",
        label: "text-yellow-700",
        dot: "bg-yellow-500",
      };
    }

    return {
      card: "border border-slate-200 bg-white",
      label: "text-slate-500",
      dot: "bg-slate-400",
    };
  }, [cropStatus]);

  const statusSummary = useMemo(() => {
    if (cropStatus === "Healthy") {
      return "Environmental conditions are currently within the stronger operating range for crop growth.";
    }
    if (cropStatus === "Needs Attention") {
      return "At least one live reading is outside the comfortable range, so the field should be checked soon.";
    }
    if (cropStatus === "Stable") {
      return "Conditions are acceptable, but a few readings are drifting away from the ideal range.";
    }
    return "Waiting for live Firebase readings to complete the field snapshot.";
  }, [cropStatus]);

  const moistureMessage =
    sensors.soilMoisture === null
      ? "Soil moisture has not been detected yet."
      : sensors.soilMoisture < 45
        ? "Hydration is low. Irrigation should be increased soon."
        : sensors.soilMoisture > 80
          ? "Soil is saturated. Drainage should be monitored."
          : "Hydration levels are within the recommended working band.";

  const temperatureMessage =
    sensors.temperature === null
      ? "Ambient temperature has not been detected yet."
      : sensors.temperature > 33
        ? "Heat stress risk is rising during peak daylight hours."
        : "Temperature remains manageable for current growth conditions.";

  const humidityMessage =
    sensors.humidity === null
      ? "Relative humidity has not been detected yet."
      : sensors.humidity > 85
        ? "Humidity is elevated, so disease pressure should be watched closely."
        : "Humidity is within a more stable transpiration range.";

  const lightMessage =
    sensors.lightIntensity === null
      ? "Light intensity has not been detected yet."
      : "Live irradiance is being tracked directly from Firebase.";

  const tempBars = [
    sensors.temperature !== null ? Math.min(1, sensors.temperature / 40) : 0.35,
    sensors.humidity !== null ? Math.min(1, sensors.humidity / 100) : 0.5,
    sensors.lightIntensity !== null ? Math.min(1, sensors.lightIntensity / 20000) : 0.2,
    sensors.waterLevel !== null ? Math.min(1, sensors.waterLevel / 4) : 0.25,
    sensors.soilMoisture !== null ? Math.min(1, sensors.soilMoisture / 100) : 0.6,
  ];

  const lastUpdated = formatLiveTimestamp(sensors.timestamp, liveNow);

  const soilPill = getSensorPill("soil", sensors.soilMoisture);
  const temperaturePill = getSensorPill("temperature", sensors.temperature);
  const humidityPill = getSensorPill("humidity", sensors.humidity);
  const lightPill = getSensorPill("light", sensors.lightIntensity);
  const waterPill = getSensorPill("water", sensors.waterLevel);

  const sensorCards = [
    {
      label: "Soil Moisture",
      icon: "water_drop",
      value: formatValue(sensors.soilMoisture, "%"),
      pill: soilPill,
    },
    {
      label: "Temperature",
      icon: "thermostat",
      value: formatValue(sensors.temperature, "\u00B0C"),
      pill: temperaturePill,
    },
    {
      label: "Humidity",
      icon: "humidity_percentage",
      value: formatValue(sensors.humidity, "%"),
      pill: humidityPill,
    },
    {
      label: "Light",
      icon: "light_mode",
      value: formatValue(sensors.lightIntensity, " lux"),
      pill: lightPill,
    },
    {
      label: "Water Level",
      icon: "water",
      value: formatValue(sensors.waterLevel, " cm"),
      pill: waterPill,
    },
  ];

  const soilGaugeStroke =
    sensors.soilMoisture === null
      ? "#94a3b8"
      : sensors.soilMoisture >= 65 && sensors.soilMoisture <= 80
        ? "#10b981"
        : sensors.soilMoisture >= 45
          ? "#f59e0b"
          : "#ef4444";

  const recommendedActions = useMemo(() => {
    const actions: Array<{ tone: "warning" | "clear"; text: string }> = [];

    if (sensors.soilMoisture !== null && sensors.soilMoisture < 45) {
      actions.push({ tone: "warning", text: "Irrigate field — soil moisture is below safe threshold" });
    }
    if (sensors.temperature !== null && sensors.temperature > 33) {
      actions.push({ tone: "warning", text: "Monitor heat stress — temperature exceeding comfortable range" });
    }
    if (sensors.humidity !== null && sensors.humidity > 85) {
      actions.push({ tone: "warning", text: "Watch for fungal risk — humidity is elevated" });
    }
    if (sensors.waterLevel !== null && sensors.waterLevel < 1.0) {
      actions.push({ tone: "warning", text: "Check water inlet — water level is low" });
    }

    if (actions.length === 0) {
      actions.push({ tone: "clear", text: "✅ No action needed — all readings within optimal range" });
    }

    return actions.slice(0, 3);
  }, [sensors.humidity, sensors.soilMoisture, sensors.temperature, sensors.waterLevel]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-10">
        <section className={`rounded-2xl p-8 shadow-[0_8px_32px_rgba(25,28,29,0.02)] ${statusStyle.card}`}>
          <span className={`mb-2 block text-[10px] font-bold uppercase tracking-[0.1em] font-label ${statusStyle.label}`}>
            Current Crop Status
          </span>
          <h2 className={`mb-3 font-headline text-4xl font-bold tracking-[0.05em] ${statusStyle.label}`}>{cropStatus}</h2>
          <p className={`max-w-md text-sm leading-relaxed ${statusStyle.label}`}>{statusSummary}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2">
            <div className={`h-2 w-2 animate-pulse rounded-full ${statusStyle.dot}`} />
            <span className={`font-label text-[11px] font-medium uppercase tracking-[0.03em] ${statusStyle.label}`}>
              Live Firebase Sync
            </span>
          </div>
          <p className={`mt-3 text-xs ${statusStyle.label}`}>Last update: {lastUpdated}</p>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_8px_32px_rgba(25,28,29,0.02)]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="font-headline text-xl font-semibold text-primary tracking-[0.02em]">Sensor Readings</h3>
              <p className="mt-1 text-sm text-on-surface-variant">Compact live overview for the six most important field indicators.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sensorCards.map((card) => (
              <article key={card.label} className="rounded-2xl border border-outline-variant/20 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <span className="material-symbols-outlined">{card.icon}</span>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-outline">{card.label}</p>
                      <h4 className="mt-1 font-headline text-2xl font-bold text-primary">{card.value}</h4>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${card.pill.className}`}>
                    {card.pill.label}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_8px_32px_rgba(25,28,29,0.02)]">
          <div className="mb-5">
            <h3 className="font-headline text-xl font-semibold text-primary tracking-[0.02em]">Recent Trend (Last 20 Readings)</h3>
            <p className="mt-1 text-sm text-on-surface-variant">Temperature and soil moisture movement from the latest `sensor_history` samples.</p>
          </div>
          {trendData.length < 3 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Collecting history...</p>
          ) : (
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={24} />
                  <Line type="monotone" dataKey="temperature" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Temperature" />
                  <Line type="monotone" dataKey="soilMoisture" stroke="#10b981" strokeWidth={2.5} dot={false} name="Soil Moisture" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_8px_32px_rgba(25,28,29,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline">Soil Moisture</span>
            <span className="material-symbols-outlined text-primary">water_drop</span>
          </div>
          <div className="mb-6 flex items-center gap-3">
            <h3 className="font-headline text-3xl font-bold text-primary">{formatValue(sensors.soilMoisture, "%")}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${soilPill.className}`}>{soilPill.label}</span>
          </div>
          <div className="mb-4 flex justify-center">
            <div className="relative h-24 w-48 overflow-hidden">
              <svg viewBox="0 0 200 100" className="h-full w-full">
                <path d="M 20 95 A 80 80 0 0 1 180 95" fill="none" stroke="hsl(var(--outline-variant))" strokeWidth="6" strokeLinecap="round" />
                <path
                  d="M 20 95 A 80 80 0 0 1 180 95"
                  fill="none"
                  stroke={soilGaugeStroke}
                  strokeWidth="6"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray={`${Math.max(0, Math.min(100, sensors.soilMoisture ?? 0))} 100`}
                />
              </svg>
            </div>
          </div>
          <p className="mb-4 text-center text-[11px] font-medium text-on-surface-variant">Optimal Range: 65-80%</p>
          <p className="text-sm leading-relaxed text-on-surface-variant">{moistureMessage}</p>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_8px_32px_rgba(25,28,29,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline">Ambient Temperature</span>
            <span className="material-symbols-outlined text-primary">thermostat</span>
          </div>
          <div className="mb-4 flex items-center gap-3">
            <h3 className="font-headline text-3xl font-bold text-primary">{formatValue(sensors.temperature, "\u00B0C")}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${temperaturePill.className}`}>{temperaturePill.label}</span>
          </div>
          <div className="mb-4 flex items-end gap-2">
            {tempBars.map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-sm bg-primary"
                style={{ height: `${Math.max(12, height * 56)}px`, opacity: 0.3 + height * 0.7 }}
              />
            ))}
          </div>
          <p className="text-sm leading-relaxed text-on-surface-variant">{temperatureMessage}</p>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_8px_32px_rgba(25,28,29,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline">Relative Humidity</span>
            <span className="material-symbols-outlined text-primary">humidity_percentage</span>
          </div>
          <div className="mb-4 flex items-center gap-3">
            <h3 className="font-headline text-3xl font-bold text-primary">{formatValue(sensors.humidity, "%")}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${humidityPill.className}`}>{humidityPill.label}</span>
          </div>
          <p className="text-sm leading-relaxed text-on-surface-variant">{humidityMessage}</p>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_8px_32px_rgba(25,28,29,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline">Light Intensity</span>
            <span className="material-symbols-outlined text-primary">light_mode</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <h3 className="font-headline text-3xl font-bold text-primary">{formatValue(sensors.lightIntensity, " lux")}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${lightPill.className}`}>{lightPill.label}</span>
              </div>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-outline-variant/30">
              <span className="material-symbols-outlined text-3xl text-primary">wb_sunny</span>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">{lightMessage}</p>
        </section>

        <section className="rounded-2xl bg-surface-container-lowest p-8 shadow-[0_8px_32px_rgba(25,28,29,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-outline">Water Level</span>
            <span className="material-symbols-outlined text-primary">water</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <h3 className="font-headline text-3xl font-bold text-primary">{formatValue(sensors.waterLevel, " cm")}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${waterPill.className}`}>{waterPill.label}</span>
              </div>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-outline-variant/30">
              <span className="material-symbols-outlined text-3xl text-primary">waves</span>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-on-surface-variant">
            {sensors.waterLevel === null
              ? "Water level has not been detected yet."
              : sensors.waterLevel < 1
                ? "Water level is critically low. Check water inlet immediately."
                : sensors.waterLevel <= 2
                  ? "Water level is below optimal. Monitor closely."
                  : "Water level is within the safe operating range."}
          </p>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="font-headline text-xl font-semibold text-primary tracking-[0.02em]">Recommended Actions</h3>
            <p className="mt-1 text-sm text-on-surface-variant">Priority checks generated from the current field readings.</p>
          </div>
          <div className="space-y-3">
            {recommendedActions.map((action) => (
              <div
                key={action.text}
                className={`rounded-xl px-4 py-4 text-sm font-medium ${action.tone === "warning" ? "bg-yellow-50 text-yellow-800" : "bg-emerald-50 text-emerald-800"
                  }`}
              >
                {action.text}
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
};

export default DashboardPage;
