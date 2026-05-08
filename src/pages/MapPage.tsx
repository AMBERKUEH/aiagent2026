import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L, { DivIcon } from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import AppLayout from "@/components/AppLayout";
import {
  FARM_ZONES,
  runWeatherDisasterAgent,
  type AgentAlert,
  type AgentRunResult,
  type CropType,
} from "@/lib/weatherDisasterAgent";

// ── Icon helpers ────────────────────────────────────────────
function buildDivIcon(color: string, size = 16): DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 0 4px ${color}33;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const farmIcon = buildDivIcon("#14532d");
const supplierIcon = buildDivIcon("#1d4ed8", 14);

// ── Severity → colour mapping ───────────────────────────────
const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#facc15",
  low: "#22c55e",
  clear: "#10b981",
};

const ALERT_TYPE_COLOR: Record<string, string> = {
  FLOOD: "#3b82f6",
  DROUGHT: "#f59e0b",
  MONSOON: "#8b5cf6",
  CLEAR: "#10b981",
};

const ALERT_TYPE_ICON: Record<string, string> = {
  FLOOD: "flood",
  DROUGHT: "local_fire_department",
  MONSOON: "thunderstorm",
  CLEAR: "check_circle",
};

// ── Individual alert card ───────────────────────────────────
function AlertCard({ alert }: { alert: AgentAlert }) {
  const typeColor = ALERT_TYPE_COLOR[alert.type] ?? "#6b7280";
  const sevColor = SEVERITY_COLOR[alert.severity] ?? "#6b7280";
  const isCritical = alert.severity === "critical";

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 transition-all ${
        isCritical
          ? "border-red-300 bg-red-50/80 shadow-sm"
          : alert.type === "CLEAR"
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-amber-200 bg-amber-50/60"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-base"
            style={{ color: typeColor }}
          >
            {ALERT_TYPE_ICON[alert.type]}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: typeColor }}>
            {alert.type} ALERT
          </span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs font-semibold text-slate-600">{alert.zone}</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{alert.timeframe}</span>
        </div>
        <div className="flex items-center gap-2">
          {alert.stale_data && (
            <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-bold uppercase">
              Stale Data
            </span>
          )}
          {alert.low_confidence_critical && (
            <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-bold uppercase animate-pulse">
              Low Confidence
            </span>
          )}
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase text-white"
            style={{ background: sevColor }}
          >
            {alert.severity}
          </span>
        </div>
      </div>

      {/* Agent-style output lines */}
      <div className="space-y-1 text-xs font-mono">
        <p className="text-slate-700">
          <span className="text-slate-400">→ </span>
          <span className="font-semibold text-slate-600">Observed: </span>
          {alert.signal}
        </p>
        <p className="text-slate-700">
          <span className="text-slate-400">→ </span>
          <span className="font-semibold text-slate-600">Predicted: </span>
          {alert.prediction}
        </p>
        {alert.type !== "CLEAR" && (
          <p className="text-slate-800 font-semibold">
            <span className="text-slate-400">→ </span>
            <span className="text-primary">Action: </span>
            {alert.action}
          </p>
        )}
        <p className="text-slate-500">
          <span className="text-slate-400">→ </span>
          <span>ML Confidence: {alert.confidence}%</span>
          <span className="text-slate-400"> | Source: </span>
          {alert.sources.slice(0, 2).join(", ")}
        </p>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${alert.confidence}%`,
              background: sevColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Mini stat card ──────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  color = "#14532d",
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-outline-variant/20 p-4 shadow-sm space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-sm" style={{ color }}>
          {icon}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-outline">{label}</span>
      </div>
      <p className="font-headline text-xl font-bold text-primary">{value}</p>
      {sub && <p className="text-[11px] text-on-surface-variant">{sub}</p>}
    </div>
  );
}

// ── Crop selector pill ──────────────────────────────────────
const ALL_CROPS: CropType[] = ["rice", "maize", "vegetables"];
const CROP_ICON: Record<CropType, string> = {
  rice: "grain",
  maize: "grass",
  vegetables: "eco",
};

// ── Main page component ─────────────────────────────────────
const MapPage = () => {
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedZones, setSelectedZones] = useState<string[]>(["north", "central", "south"]);
  const [showDataPanel, setShowDataPanel] = useState(false);
  const [nextRunSecs, setNextRunSecs] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  // ── Run agent ─────────────────────────────────────────────
  const runAgent = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await runWeatherDisasterAgent(selectedZones);
      setResult(res);
      // Start 6-hour countdown
      setNextRunSecs(res.next_run_in_hours * 3600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent run failed.");
    } finally {
      setIsRunning(false);
    }
  }, [selectedZones]);

  // Auto-run on mount
  useEffect(() => {
    runAgent();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer
  useEffect(() => {
    if (nextRunSecs === null) return;
    countdownRef.current = window.setInterval(() => {
      setNextRunSecs((s) => {
        if (s === null || s <= 1) {
          return null;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current !== null) clearInterval(countdownRef.current);
    };
  }, [nextRunSecs]);

  const formatCountdown = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}h ${m}m ${s}s`;
  };

  // ── Zone toggle ───────────────────────────────────────────
  const toggleZone = (id: string) => {
    setSelectedZones((prev) =>
      prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id],
    );
  };

  // ── Map overlay data ──────────────────────────────────────
  const zoneOverlays = useMemo(() => {
    if (!result) return [];
    return FARM_ZONES.filter((z) => selectedZones.includes(z.id)).map((zone) => {
      const alert = result.alerts.find((a) => a.spatial_zone_id === zone.spatial_zone_id);
      const color = alert ? SEVERITY_COLOR[alert.severity] : SEVERITY_COLOR.clear;
      return { zone, alert, color };
    });
  }, [result, selectedZones]);

  // ── Summary stats ─────────────────────────────────────────
  const activeAlerts = result?.alerts.filter((a) => a.type !== "CLEAR") ?? [];
  const criticalCount = activeAlerts.filter((a) => a.severity === "critical").length;

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-5 pb-8">

        {/* ── AGENT HEADER ─────────────────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-r from-primary via-primary-container to-tertiary-container p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.05) 20px, rgba(255,255,255,0.05) 40px)",
              }}
            />
          </div>
          <div className="relative z-10">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-emerald-300">satellite_alt</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300">
                    Spatial Intelligence Module
                  </span>
                </div>
                <h1 className="font-headline text-2xl font-bold text-white leading-tight">
                  Agricultural Weather &amp; Disaster
                  <br />
                  Prediction Agent
                </h1>
                <p className="text-sm text-emerald-100/80 mt-1 max-w-md">
                  Zone-specific flood, drought &amp; monsoon monitoring with ML-powered risk scoring.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {result && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-mono text-emerald-200">
                    Last run: {new Date(result.run_timestamp).toLocaleTimeString()}
                  </span>
                )}
                {nextRunSecs !== null && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-mono text-white/70">
                    Next: {formatCountdown(nextRunSecs)}
                  </span>
                )}
                {criticalCount > 0 && (
                  <span className="rounded-full bg-red-500 px-3 py-1 text-[11px] font-bold uppercase text-white animate-pulse">
                    ⚠ {criticalCount} Critical
                  </span>
                )}
              </div>
            </div>

            {/* Data sources row */}
            <div className="mt-4 flex flex-wrap gap-2">
              {["Open-Meteo", "NASA POWER", "Sentinel-2 NDVI", "IoT Sensors", "IMD/ECMWF"].map(
                (src) => (
                  <span
                    key={src}
                    className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-emerald-200"
                  >
                    {src}
                  </span>
                ),
              )}
            </div>
          </div>
        </div>

        {/* ── CONTROL PANEL ────────────────────────────────── */}
        <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-5 shadow-sm">
          <h2 className="font-headline text-base font-semibold text-primary mb-4">
            Agent Configuration
          </h2>
          <div className="flex flex-wrap gap-6 items-end">
            {/* Zone selector */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-outline mb-2">
                Active Zones
              </p>
              <div className="flex gap-2">
                {FARM_ZONES.map((z) => (
                  <button
                    key={z.id}
                    id={`zone-toggle-${z.id}`}
                    onClick={() => toggleZone(z.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                      selectedZones.includes(z.id)
                        ? "bg-primary text-white shadow"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {z.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Crops display */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-outline mb-2">
                Crops in Field
              </p>
              <div className="flex gap-2">
                {ALL_CROPS.map((crop) => {
                  const active = FARM_ZONES.filter((z) => selectedZones.includes(z.id)).some((z) =>
                    z.crops.includes(crop),
                  );
                  return (
                    <span
                      key={crop}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                        active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      <span className="material-symbols-outlined text-xs">{CROP_ICON[crop]}</span>
                      {crop.charAt(0).toUpperCase() + crop.slice(1)}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Run button */}
            <button
              id="run-agent-btn"
              onClick={runAgent}
              disabled={isRunning || selectedZones.length === 0}
              className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow"
            >
              <span
                className={`material-symbols-outlined text-base ${isRunning ? "animate-spin" : ""}`}
              >
                {isRunning ? "refresh" : "play_arrow"}
              </span>
              {isRunning ? "Running Agent..." : "Run Agent"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-red-500">error</span>
            {error}
          </div>
        )}

        {/* ── MAP + ALERTS GRID ─────────────────────────────── */}
        {isRunning && !result && (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-3">
              refresh
            </span>
            <p className="text-sm text-on-surface-variant">
              Fetching real-time weather data and running threshold analysis...
            </p>
          </div>
        )}

        {result && (
          <div className="grid gap-5 lg:grid-cols-5">
            {/* Map (3 cols) */}
            <div className="lg:col-span-3">
              <div className="rounded-2xl border border-outline-variant/20 overflow-hidden shadow-sm">
                {/* Layer legend */}
                <div className="bg-surface-container-lowest px-4 py-3 border-b border-outline-variant/15 flex items-center gap-4 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-outline">
                    Risk Overlay
                  </span>
                  {Object.entries(SEVERITY_COLOR).slice(0, 4).map(([sev, color]) => (
                    <span key={sev} className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="text-[11px] text-on-surface-variant capitalize">{sev}</span>
                    </span>
                  ))}
                </div>

                <div className="h-[480px] w-full">
                  <MapContainer
                    center={[4.5, 101.5]}
                    zoom={7}
                    className="h-full w-full"
                    scrollWheelZoom
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Zone risk overlays */}
                    {zoneOverlays.map(({ zone, alert, color }) => (
                      <Circle
                        key={zone.spatial_zone_id}
                        center={zone.mapCenter}
                        radius={zone.mapRadius}
                        pathOptions={{
                          color,
                          fillColor: color,
                          fillOpacity: 0.3,
                          weight: 2,
                        }}
                      >
                        <Tooltip>
                          <div className="text-xs space-y-0.5">
                            <p className="font-bold">{zone.name} Zone</p>
                            {alert && (
                              <>
                                <p>
                                  {alert.type} · {alert.severity}
                                </p>
                                <p>{alert.confidence}% confidence</p>
                              </>
                            )}
                          </div>
                        </Tooltip>
                      </Circle>
                    ))}

                    {/* Farm markers */}
                    {FARM_ZONES.filter((z) => selectedZones.includes(z.id)).map((zone) => {
                      const alert = result.alerts.find(
                        (a) => a.spatial_zone_id === zone.spatial_zone_id,
                      );
                      const soilRead = result.soil.find((s) => s.zone_id === zone.spatial_zone_id);
                      const ndviRead = result.ndvi.find((n) => n.zone_id === zone.spatial_zone_id);
                      return (
                        <Marker
                          key={zone.id}
                          position={[zone.lat, zone.lon]}
                          icon={buildDivIcon(
                            alert ? SEVERITY_COLOR[alert.severity] : "#14532d",
                            16,
                          )}
                        >
                          <Popup>
                            <div className="text-xs space-y-1 min-w-[180px]">
                              <p className="font-bold text-emerald-900">{zone.name} Zone</p>
                              <p>
                                Crops:{" "}
                                {zone.crops.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ")}
                              </p>
                              {soilRead && <p>Soil moisture: {soilRead.moisture_pct}%</p>}
                              {ndviRead && (
                                <p>
                                  NDVI: {ndviRead.current_ndvi} (avg {ndviRead.seasonal_avg_ndvi})
                                </p>
                              )}
                              {alert && (
                                <p
                                  className="font-semibold px-2 py-1 rounded"
                                  style={{ background: ALERT_TYPE_COLOR[alert.type] + "22" }}
                                >
                                  {alert.type}: {alert.severity}
                                </p>
                              )}
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })}

                    {/* Supplier markers */}
                    {[
                      { id: "sup-a", name: "AgriOne Depot", pos: [6.05, 100.4] as [number, number], price: 99 },
                      { id: "sup-b", name: "GreenField Supply", pos: [3.42, 101.2] as [number, number], price: 103 },
                    ].map((s) => (
                      <Marker key={s.id} position={s.pos} icon={supplierIcon}>
                        <Popup>
                          <div className="text-xs space-y-0.5">
                            <p className="font-bold text-blue-900">{s.name}</p>
                            <p>Urea: RM {s.price}</p>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </div>
            </div>

            {/* Alerts feed (2 cols) */}
            <div className="lg:col-span-2 space-y-3 max-h-[540px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between px-1">
                <h2 className="font-headline text-base font-semibold text-primary">
                  Active Alerts
                </h2>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {result.alerts.length}
                </span>
              </div>
              {result.alerts.map((alert, idx) => (
                <AlertCard key={`${alert.spatial_zone_id}-${idx}`} alert={alert} />
              ))}
            </div>
          </div>
        )}

        {/* ── QUICK STATS ROW ───────────────────────────────── */}
        {result && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon="water"
              label="48h Rainfall"
              value={`${result.weather.rainfall_48h_mm} mm`}
              sub={result.weather.source}
              color="#3b82f6"
            />
            <StatCard
              icon="humidity_percentage"
              label="Avg Humidity"
              value={`${result.weather.humidity_pct}%`}
              sub={`3-day avg: ${result.weather.humidity_3day_avg}%`}
              color="#0ea5e9"
            />
            <StatCard
              icon="air"
              label="Wind"
              value={`${result.weather.wind_speed_kmh} km/h`}
              sub={`Direction: ${result.weather.wind_direction_deg}°`}
              color="#6366f1"
            />
            <StatCard
              icon="thunderstorm"
              label="Monsoon Front"
              value={`${result.monsoon.front_days_away} days`}
              sub={result.monsoon.source}
              color="#8b5cf6"
            />
          </div>
        )}

        {/* ── NDVI / SPI / SOIL TABLE ───────────────────────── */}
        {result && (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant/15">
              <h2 className="font-headline text-base font-semibold text-primary">
                Zone Data Summary
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                NDVI · SPI drought index · IoT soil moisture per zone
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-outline-variant/10">
                    {["Zone", "Crops", "Soil Moisture", "NDVI", "NDVI Drop", "SPI (10d)", "Status"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 font-bold uppercase tracking-wider text-outline text-[10px]"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {FARM_ZONES.filter((z) => selectedZones.includes(z.id)).map((zone) => {
                    const soil = result.soil.find((s) => s.zone_id === zone.spatial_zone_id);
                    const ndvi = result.ndvi.find((n) => n.zone_id === zone.spatial_zone_id);
                    const spi = result.spi.find((s) => s.zone_id === zone.spatial_zone_id);
                    const alert = result.alerts.find(
                      (a) => a.spatial_zone_id === zone.spatial_zone_id,
                    );
                    return (
                      <tr
                        key={zone.id}
                        className="border-b border-outline-variant/10 hover:bg-surface-container-low/50 transition-colors"
                      >
                        <td className="px-4 py-3 font-semibold text-primary">{zone.name}</td>
                        <td className="px-4 py-3 text-on-surface-variant">
                          {zone.crops.join(", ")}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-bold text-[10px] uppercase ${
                              (soil?.moisture_pct ?? 0) > 85
                                ? "bg-blue-100 text-blue-700"
                                : (soil?.moisture_pct ?? 0) < 25
                                  ? "bg-red-100 text-red-700"
                                  : "bg-green-100 text-green-700"
                            }`}
                          >
                            {soil?.moisture_pct ?? "--"}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant">
                          {ndvi?.current_ndvi ?? "--"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-bold text-[10px] uppercase ${
                              (ndvi?.drop_pct ?? 0) > 15
                                ? "bg-red-100 text-red-700"
                                : (ndvi?.drop_pct ?? 0) > 10
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-green-100 text-green-700"
                            }`}
                          >
                            {ndvi?.drop_pct ?? "0"}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-bold text-[10px] uppercase ${
                              (spi?.spi_value ?? 0) < -1
                                ? "bg-red-100 text-red-700"
                                : (spi?.spi_value ?? 0) < -0.5
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-green-100 text-green-700"
                            }`}
                          >
                            {spi?.spi_value ?? "--"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {alert && (
                            <span
                              className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase text-white"
                              style={{ background: ALERT_TYPE_COLOR[alert.type] }}
                            >
                              {alert.type}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SMS PREVIEW ───────────────────────────────────── */}
        {result && (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary text-base">sms</span>
              <h2 className="font-headline text-base font-semibold text-primary">
                SMS Alert Preview
              </h2>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-outline">
                {result.summary_sms.length} / 160 chars
              </span>
            </div>
            <div className="rounded-2xl bg-emerald-900 p-4 max-w-sm mx-auto">
              <div className="rounded-xl bg-white/10 p-3">
                <p className="text-[11px] font-mono text-emerald-100 leading-relaxed break-words">
                  {result.summary_sms}
                </p>
              </div>
              <p className="mt-2 text-[10px] text-emerald-300/60 text-right">
                Delivered to farmer · {new Date(result.run_timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}

        {/* ── HISTORICAL BASELINE ───────────────────────────── */}
        {result && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-amber-600 text-base">history</span>
                <h2 className="font-headline text-base font-semibold text-primary">
                  30-Year Baseline
                </h2>
                <span className="ml-auto text-[10px] text-outline">{result.baseline.source}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-outline">
                    Avg Monthly Rain
                  </p>
                  <p className="font-headline text-2xl font-bold text-primary mt-1">
                    {result.baseline.avg_rainfall_mm} mm
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-outline">
                    Avg Temp Max
                  </p>
                  <p className="font-headline text-2xl font-bold text-primary mt-1">
                    {result.baseline.avg_temperature_c}°C
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full"
                  style={{
                    width: `${Math.min(100, (result.weather.rainfall_10d_mm / result.baseline.avg_rainfall_mm) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-on-surface-variant mt-1">
                10-day forecast vs. monthly baseline:{" "}
                {Math.round((result.weather.rainfall_10d_mm / result.baseline.avg_rainfall_mm) * 100)}%
              </p>
            </div>

            {/* Monsoon status */}
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/20 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-violet-600 text-base">cyclone</span>
                <h2 className="font-headline text-base font-semibold text-primary">
                  Monsoon Track
                </h2>
                <span className="ml-auto text-[10px] text-outline">{result.monsoon.source}</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-on-surface-variant">Front ETA</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      result.monsoon.front_days_away <= 3
                        ? "bg-red-100 text-red-800"
                        : result.monsoon.front_days_away <= 5
                          ? "bg-amber-100 text-amber-800"
                          : "bg-green-100 text-green-800"
                    }`}
                  >
                    {result.monsoon.front_days_away} days
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-on-surface-variant">SW Wind Shift</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      result.monsoon.sw_wind_detected
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {result.monsoon.sw_wind_detected ? "Detected" : "Not detected"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-on-surface-variant">Humidity {">"} 75% (3-day)</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      result.monsoon.humidity_3day_above_75
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {result.monsoon.humidity_3day_above_75 ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}


      </div>
    </AppLayout>
  );
};

export default MapPage;
