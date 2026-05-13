// ============================================================
// Dashboard Page — Today's Advice
// ============================================================
// Redesigned to match the SmartPaddy reference: greeting header,
// today's recommendation card, "what you can do now" actions,
// live field sensors, and bottom status bar.
// ============================================================

import AppLayout from "@/components/AppLayout";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { rtdb } from "@/lib/firebase";
import { normalizeSensorPayload } from "@/lib/sensors";
import { onValue, ref } from "firebase/database";

const formatValue = (value: number | null, suffix = "") =>
  value === null ? "--" : `${value.toFixed(1)}${suffix}`;

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const formatDate = () => {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Today · ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}, ${days[now.getDay()]} · ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")} ${now.getHours() >= 12 ? "PM" : "AM"}`;
};

export default function CommandCenterPage() {
  const { ctx, isRunning, runCycle, hasLiveSensors, latestSensors } = useFarmContext();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Live sensors from Firebase
  const [sensors, setSensors] = useState({
    humidity: null as number | null,
    soilMoisture: null as number | null,
    temperature: null as number | null,
    waterLevel: null as number | null,
  });

  useEffect(() => {
    const candidatePaths = ["/sensor_history"];
    const unsubscribes = candidatePaths.map((path) =>
      onValue(ref(rtdb, path), (snapshot) => {
        const normalized = normalizeSensorPayload(snapshot.val() ?? {});
        if (normalized.hasAnySensorValue) {
          setSensors({
            humidity: normalized.humidity,
            soilMoisture: normalized.soilMoisture,
            temperature: normalized.temperature,
            waterLevel: normalized.waterLevel,
          });
        }
      })
    );
    return () => unsubscribes.forEach((u) => u());
  }, []);

  // Auto-run agent cycle
  useEffect(() => {
    if (ctx.phase === "idle" && !isRunning && hasLiveSensors) {
      runCycle();
    }
  }, [ctx.phase, hasLiveSensors, isRunning, runCycle]);

  const recommendation = ctx.recommendation;
  const findings = ctx.findings;

  // Build actionable items from agent findings
  const actionItems = useMemo(() => {
    const actions: Array<{ icon: string; text: string; done: boolean }> = [];

    if (sensors.soilMoisture !== null && sensors.soilMoisture > 80) {
      actions.push({ icon: "water_drop", text: "Check drainage", done: false });
    }
    if (findings.some(f => f.agentName.toLowerCase().includes("crop") || f.agentName.toLowerCase().includes("health"))) {
      actions.push({ icon: "center_focus_strong", text: "Re-scan morning", done: false });
    }
    if (sensors.soilMoisture !== null && sensors.soilMoisture < 45) {
      actions.push({ icon: "water", text: "Irrigate field", done: false });
    }
    if (sensors.waterLevel !== null && sensors.waterLevel < 2) {
      actions.push({ icon: "waves", text: "Check water inlet", done: false });
    }

    // Default actions if none triggered
    if (actions.length === 0) {
      actions.push(
        { icon: "visibility", text: "Check drainage", done: false },
        { icon: "center_focus_strong", text: "Re-scan morning", done: false },
        { icon: "block", text: "Do not irrigate now", done: true },
      );
    }

    return actions.slice(0, 4);
  }, [sensors, findings]);

  // Sensor display cards
  const sensorDisplayCards = [
    {
      icon: "water_drop",
      label: "Soil Moisture",
      value: formatValue(sensors.soilMoisture, "%"),
      raw: sensors.soilMoisture,
      status: sensors.soilMoisture === null ? "Offline" : sensors.soilMoisture >= 65 && sensors.soilMoisture <= 80 ? "Good" : "Warning",
      statusColor: sensors.soilMoisture === null ? "text-slate-400 bg-slate-100" : sensors.soilMoisture >= 65 && sensors.soilMoisture <= 80 ? "text-emerald-700 bg-emerald-100" : "text-amber-700 bg-amber-100",
      iconBg: "bg-blue-50 text-blue-600",
    },
    {
      icon: "humidity_percentage",
      label: "Humidity",
      value: formatValue(sensors.humidity, "%"),
      raw: sensors.humidity,
      status: sensors.humidity === null ? "Offline" : sensors.humidity > 85 ? "Warning" : "Normal",
      statusColor: sensors.humidity === null ? "text-slate-400 bg-slate-100" : sensors.humidity > 85 ? "text-amber-700 bg-amber-100" : "text-emerald-700 bg-emerald-100",
      iconBg: "bg-cyan-50 text-cyan-600",
    },
    {
      icon: "thermostat",
      label: "Temperature",
      value: formatValue(sensors.temperature, "°C"),
      raw: sensors.temperature,
      status: sensors.temperature === null ? "Offline" : sensors.temperature >= 25 && sensors.temperature <= 33 ? "Normal" : "Warning",
      statusColor: sensors.temperature === null ? "text-slate-400 bg-slate-100" : sensors.temperature >= 25 && sensors.temperature <= 33 ? "text-emerald-700 bg-emerald-100" : "text-amber-700 bg-amber-100",
      iconBg: "bg-orange-50 text-orange-600",
    },
    {
      icon: "waves",
      label: "Water Level",
      value: formatValue(sensors.waterLevel, " cm"),
      raw: sensors.waterLevel,
      status: sensors.waterLevel === null ? "Offline" : sensors.waterLevel >= 2 ? "Safe" : "Low",
      statusColor: sensors.waterLevel === null ? "text-slate-400 bg-slate-100" : sensors.waterLevel >= 2 ? "text-emerald-700 bg-emerald-100" : "text-red-700 bg-red-100",
      iconBg: "bg-indigo-50 text-indigo-600",
    },
  ];

  const userName = user?.email?.split("@")[0]?.replace(/[._]/g, " ") ?? "Farmer";
  const displayName = userName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  // Confidence & risk from recommendation
  const confidence = recommendation
    ? Math.round((recommendation.chain[0] as any)?.confidence ?? 82)
    : null;
  const riskLevel = ctx.riskProfile
    ? ctx.riskProfile.overallRisk > 60
      ? "High Risk"
      : ctx.riskProfile.overallRisk > 30
        ? "Moderate Risk"
        : "Low Risk"
    : null;
  const riskColor = ctx.riskProfile
    ? ctx.riskProfile.overallRisk > 60
      ? "text-red-600"
      : ctx.riskProfile.overallRisk > 30
        ? "text-amber-600"
        : "text-emerald-600"
    : "";

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-5 pb-4">

        {/* ── Greeting Header ───────────────────────────────── */}
        <section className="flex items-center justify-between flex-wrap gap-3 pt-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center overflow-hidden">
              <span className="text-base font-bold text-primary uppercase">
                {user?.email?.charAt(0) ?? "F"}
              </span>
            </div>
            <div>
              <h1 className="font-headline text-lg font-bold text-slate-900 leading-tight">
                {getGreeting()}, {displayName}
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">{formatDate()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold hover:bg-primary/15 transition-colors">
              <span className="material-symbols-outlined text-sm">grass</span>
              Paddy Field 3A
              <span className="material-symbols-outlined text-sm">arrow_drop_down</span>
            </button>
          </div>
        </section>

        {/* ── Today's Recommendation Card ────────────────────── */}
        {recommendation && ctx.phase === "done" ? (
          <section
            className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm cursor-pointer hover:shadow-md transition-all"
            onClick={() => navigate("/scenarios")}
          >
            <div className="flex items-center gap-1.5 mb-3">
              <span className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_awesome
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Today's Recommendation
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-5">
              <div className="flex-1">
                <h2 className="font-headline text-xl sm:text-2xl font-bold text-slate-900 leading-tight mb-3">
                  {recommendation.strategyName}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-4">
                  {recommendation.summary}
                </p>

                {/* Why? Reasons */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Why?</p>
                  {recommendation.chain[0] && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-blue-500 text-sm">water_drop</span>
                        <span className="text-xs text-slate-700">{(recommendation.chain[0] as any).because ?? "Soil moisture is high"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-cyan-500 text-sm">rainy</span>
                        <span className="text-xs text-slate-700">{(recommendation.chain[0] as any).whichMeans ?? "Rain risk in next 48 hours"}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Confidence Circle */}
              {confidence !== null && (
                <div className="flex flex-col items-center justify-center gap-2 shrink-0">
                  <div className="relative w-24 h-24">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="6" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke="hsl(var(--primary))"
                        strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${confidence * 2.64} 264`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="font-headline text-2xl font-bold text-primary">{confidence}%</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">Confidence</span>
                  {riskLevel && (
                    <span className={`text-[10px] font-bold ${riskColor}`}>{riskLevel}</span>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : isRunning ? (
          <section className="rounded-3xl bg-white border border-slate-200 p-8 text-center shadow-sm">
            <span className="material-symbols-outlined text-3xl text-primary animate-spin mb-2 block">neurology</span>
            <p className="text-sm text-slate-500">SmartPaddy is analyzing your field...</p>
          </section>
        ) : (
          <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-amber-500 text-sm">lightbulb</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Waiting for data</span>
            </div>
            <p className="text-sm text-slate-600">
              SmartPaddy needs live sensor data to generate your daily recommendation.
            </p>
          </section>
        )}

        {/* ── Two Column: Actions + Live Sensors ─────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* What you can do now */}
          <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <h3 className="font-headline text-sm font-bold text-slate-900 mb-3">
              What you can do now
            </h3>
            <div className="space-y-2.5">
              {actionItems.map((action, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                    action.done
                      ? "border-slate-100 bg-slate-50/50 opacity-60"
                      : "border-slate-200 bg-white hover:border-primary/30 hover:bg-primary/5"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    action.done ? "bg-slate-100 text-slate-400" : "bg-primary/10 text-primary"
                  }`}>
                    <span className="material-symbols-outlined text-base">{action.icon}</span>
                  </div>
                  <span className={`text-sm font-medium ${action.done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                    {action.text}
                  </span>
                  {action.done && (
                    <span className="ml-auto material-symbols-outlined text-emerald-500 text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_circle
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Live Field Sensors */}
          <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline text-sm font-bold text-slate-900">
                Live Field Sensors
              </h3>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-slate-400 font-medium">
                  Updated: {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {sensorDisplayCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-slate-100 p-3 hover:border-slate-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${card.iconBg}`}>
                      <span className="material-symbols-outlined text-sm">{card.icon}</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{card.label}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <span className="font-headline text-xl font-bold text-slate-900">{card.value}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${card.statusColor}`}>
                      {card.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Risk Profile Strip ─────────────────────────────── */}
        {ctx.riskProfile && ctx.phase === "done" && (
          <section className="grid grid-cols-5 gap-2">
            {[
              { label: "Overall", value: ctx.riskProfile.overallRisk, color: ctx.riskProfile.overallRisk > 60 ? "#ef4444" : ctx.riskProfile.overallRisk > 30 ? "#f59e0b" : "#22c55e", icon: "shield" },
              { label: "Flood", value: ctx.riskProfile.floodRisk, color: "#3b82f6", icon: "flood" },
              { label: "Drought", value: ctx.riskProfile.droughtRisk, color: "#f59e0b", icon: "local_fire_department" },
              { label: "Disease", value: ctx.riskProfile.diseaseRisk, color: "#ef4444", icon: "coronavirus" },
              { label: "Market", value: ctx.riskProfile.marketRisk, color: "#8b5cf6", icon: "trending_up" },
            ].map((r) => (
              <div key={r.label} className="rounded-2xl bg-white border border-slate-100 p-3 shadow-sm">
                <div className="flex items-center gap-1 mb-1">
                  <span className="material-symbols-outlined text-xs" style={{ color: r.color }}>{r.icon}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{r.label}</span>
                </div>
                <p className="font-headline text-lg font-bold text-slate-900">{r.value}<span className="text-[10px] text-slate-400">%</span></p>
                <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.value}%`, background: r.color }} />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── Bottom Status Bar ──────────────────────────────── */}
        <section className="rounded-2xl bg-primary/5 border border-primary/10 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-sm">visibility</span>
            <p className="text-xs text-primary/80 font-medium">
              Keep monitoring. Conditions can change quickly.{" "}
              <span className="font-bold text-primary">SmartPaddy is watching your field 24/7.</span>
            </p>
          </div>
          <button
            onClick={() => navigate("/sensors")}
            className="text-xs font-bold text-primary hover:underline whitespace-nowrap"
          >
            View Details →
          </button>
        </section>

        {/* ── Weather + Location Bar ─────────────────────────── */}
        <section className="flex items-center justify-between px-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">person</span>
              <span>{displayName}</span>
            </div>
            <span>·</span>
            <span>Kedah, Malaysia</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">cloud</span>
              <span>29°C | Cloudy</span>
            </div>
            <span className="flex items-center gap-1">
              <span>BM</span>
              <span className="text-slate-300">|</span>
              <span className="font-bold text-primary">EN</span>
            </span>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
