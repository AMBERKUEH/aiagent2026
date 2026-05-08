// ============================================================
// Command Center Page
// ============================================================
// Replaces the passive DashboardPage with an agentic co-pilot
// interface showing: agent status pipeline, top recommendation,
// agent findings feed, and compact sensor strip.
// ============================================================

import AppLayout from "@/components/AppLayout";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";
import { GOAL_PRESETS, type GoalType, type UserGoal, type FindingSeverity, type OrchestratorPhase } from "@/lib/agents/types";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Phase pipeline ──────────────────────────────────────────

const PHASES: { key: OrchestratorPhase; label: string; icon: string }[] = [
  { key: "perceiving", label: "Perceive", icon: "sensors" },
  { key: "analyzing", label: "Analyze", icon: "psychology" },
  { key: "synthesizing", label: "Synthesize", icon: "hub" },
  { key: "recommending", label: "Recommend", icon: "auto_awesome" },
];

function PhasePipeline({ currentPhase }: { currentPhase: OrchestratorPhase }) {
  const phaseOrder = ["idle", "perceiving", "analyzing", "synthesizing", "recommending", "done", "error"];
  const currentIdx = phaseOrder.indexOf(currentPhase);

  return (
    <div className="flex items-center gap-1">
      {PHASES.map((p, i) => {
        const pIdx = phaseOrder.indexOf(p.key);
        const isDone = currentIdx > pIdx || currentPhase === "done";
        const isActive = currentPhase === p.key;
        const isPending = currentIdx < pIdx && currentPhase !== "done";

        return (
          <div key={p.key} className="flex items-center gap-1">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
              isActive ? "bg-primary text-white shadow-lg scale-105 animate-pulse" :
              isDone ? "bg-emerald-100 text-emerald-700" :
              "bg-slate-100 text-slate-400"
            }`}>
              <span className="material-symbols-outlined text-sm" style={isDone ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {isDone ? "check_circle" : isActive ? p.icon : p.icon}
              </span>
              <span className="hidden sm:inline">{p.label}</span>
            </div>
            {i < PHASES.length - 1 && (
              <div className={`w-6 h-0.5 rounded transition-colors duration-500 ${
                isDone ? "bg-emerald-300" : "bg-slate-200"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Severity badge ──────────────────────────────────────────

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
  positive: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const SEVERITY_ICONS: Record<FindingSeverity, string> = {
  critical: "error",
  warning: "warning",
  info: "info",
  positive: "check_circle",
};

// ── Main component ──────────────────────────────────────────

export default function CommandCenterPage() {
  const { ctx, isRunning, runCycle, lastCycleTime } = useFarmContext();
  const navigate = useNavigate();
  const [goalType, setGoalType] = useState<GoalType>("balanced");
  const [budgetRM, setBudgetRM] = useState<number>(5000);

  // Auto-run on first mount
  useEffect(() => {
    if (ctx.phase === "idle" && !isRunning) {
      runCycle();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRunCycle = () => {
    const goal: UserGoal = {
      type: goalType,
      label: GOAL_PRESETS[goalType].label,
      budgetRM,
      constraints: [],
    };
    runCycle(goal);
  };

  const sensors = ctx.perception?.sensors;
  const recommendation = ctx.recommendation;
  const findings = ctx.findings;
  const riskProfile = ctx.riskProfile;

  // Sort findings: critical first, then warning, info, positive
  const sortedFindings = [...findings].sort((a, b) => {
    const order: Record<FindingSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  const newFindings = sortedFindings.filter(f => f.severity !== "positive").length;

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl space-y-5">

        {/* ── Agent Header + Pipeline ──────────────────────── */}
        <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.1) 20px, rgba(255,255,255,0.1) 40px)",
          }} />
          <div className="relative z-10">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-emerald-400 text-sm">smart_toy</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400">SmartPaddy Agent System</span>
                </div>
                <h1 className="font-headline text-2xl font-bold">Command Center</h1>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {ctx.phase === "done" && lastCycleTime !== null && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-mono text-emerald-300">
                    Cycle: {(lastCycleTime / 1000).toFixed(1)}s
                  </span>
                )}
                {ctx.timestamp && ctx.phase === "done" && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-mono text-white/60">
                    {new Date(ctx.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            <PhasePipeline currentPhase={ctx.phase} />

            {/* Agent status strip */}
            <div className="mt-4 flex flex-wrap gap-2">
              {ctx.agentStatuses.map(agent => (
                <div key={agent.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  agent.status === "running" ? "bg-primary/30 text-primary-foreground animate-pulse" :
                  agent.status === "done" ? "bg-emerald-500/20 text-emerald-300" :
                  agent.status === "error" ? "bg-red-500/20 text-red-300" :
                  "bg-white/5 text-white/40"
                }`}>
                  <span className="material-symbols-outlined text-xs">{agent.icon}</span>
                  {agent.name}
                  {agent.durationMs !== null && agent.status === "done" && (
                    <span className="text-white/30">{agent.durationMs}ms</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Goal Selector + Run ──────────────────────────── */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 block">Your Goal</label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(GOAL_PRESETS) as [GoalType, typeof GOAL_PRESETS[GoalType]][]).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => setGoalType(key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                      goalType === key
                        ? "bg-primary text-white shadow-md"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{preset.icon}</span>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 block">Budget (RM)</label>
                <input
                  type="number"
                  value={budgetRM}
                  onChange={e => setBudgetRM(Number(e.target.value) || 0)}
                  className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button
                onClick={handleRunCycle}
                disabled={isRunning}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                <span className={`material-symbols-outlined text-base ${isRunning ? "animate-spin" : ""}`}>
                  {isRunning ? "refresh" : "play_arrow"}
                </span>
                {isRunning ? "Running..." : "Run Agent Cycle"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Top Recommendation ───────────────────────────── */}
        {recommendation && ctx.phase === "done" && (
          <section
            className="rounded-2xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-white to-primary/5 p-6 shadow-sm cursor-pointer hover:shadow-md transition-all"
            onClick={() => navigate("/scenarios")}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shrink-0">
                <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Top Recommendation</span>
                  <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                    {recommendation.contributors[0]?.agentName}
                  </span>
                </div>
                <h2 className="font-headline text-lg font-bold text-slate-900 mb-1">
                  {recommendation.strategyName} Strategy
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {recommendation.summary}
                </p>
                {recommendation.chain[0] && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <p className="text-xs text-slate-700 font-medium">
                      <span className="text-slate-400">Because → </span>{recommendation.chain[0].because}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      <span className="text-slate-400">Trade-off → </span>{recommendation.chain[0].tradeoff}
                    </p>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2 text-xs text-primary font-semibold">
                  View Scenario Comparison
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Risk Overview ────────────────────────────────── */}
        {riskProfile && ctx.phase === "done" && (
          <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Overall", value: riskProfile.overallRisk, color: riskProfile.overallRisk > 60 ? "#ef4444" : riskProfile.overallRisk > 30 ? "#f59e0b" : "#22c55e", icon: "shield" },
              { label: "Flood", value: riskProfile.floodRisk, color: "#3b82f6", icon: "flood" },
              { label: "Drought", value: riskProfile.droughtRisk, color: "#f59e0b", icon: "local_fire_department" },
              { label: "Disease", value: riskProfile.diseaseRisk, color: "#ef4444", icon: "coronavirus" },
              { label: "Market", value: riskProfile.marketRisk, color: "#8b5cf6", icon: "trending_up" },
            ].map(r => (
              <div key={r.label} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="material-symbols-outlined text-sm" style={{ color: r.color }}>{r.icon}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{r.label}</span>
                </div>
                <p className="font-headline text-2xl font-bold text-slate-900">{r.value}<span className="text-sm text-slate-400">%</span></p>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.value}%`, background: r.color }} />
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── Agent Findings Feed ──────────────────────────── */}
        {sortedFindings.length > 0 && ctx.phase === "done" && (
          <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="font-headline text-base font-semibold text-slate-900">Agent Findings</h2>
                {newFindings > 0 && (
                  <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
                    {newFindings} actionable
                  </span>
                )}
              </div>
              <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-bold">
                {sortedFindings.length} total
              </span>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {sortedFindings.map(f => (
                <div key={f.id} className={`flex items-start gap-3 rounded-xl border p-3 transition-all ${SEVERITY_STYLES[f.severity]}`}>
                  <span className="material-symbols-outlined text-base mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {SEVERITY_ICONS[f.severity]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold">{f.finding}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{f.agentName}</span>
                      <span className="text-[10px] text-slate-400">{f.confidence}%</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Compact Sensor Strip ─────────────────────────── */}
        {sensors && (
          <section className="rounded-2xl bg-slate-50 border border-slate-200 px-5 py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-emerald-500">sensors</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live Sensors</span>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                <span>🌡️ {sensors.temperature ?? "--"}°C</span>
                <span className="text-slate-300">|</span>
                <span>💧 {sensors.soilMoisture ?? "--"}%</span>
                <span className="text-slate-300">|</span>
                <span>💦 {sensors.humidity ?? "--"}%</span>
                <span className="text-slate-300">|</span>
                <span>☀️ {sensors.lightIntensity ?? "--"} lux</span>
                <span className="text-slate-300">|</span>
                <span>🌊 {sensors.waterLevel ?? "--"} cm</span>
              </div>
            </div>
          </section>
        )}

        {/* ── Loading state ────────────────────────────────── */}
        {isRunning && ctx.phase !== "done" && (
          <section className="rounded-2xl bg-white border border-slate-200 p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-3 block">neurology</span>
            <p className="text-sm text-slate-500">
              {ctx.phase === "perceiving" && "Perceiving farm state from sensors and weather APIs..."}
              {ctx.phase === "analyzing" && "Running analysis agents across field, weather, crop, and economic data..."}
              {ctx.phase === "synthesizing" && "Synthesizing cross-agent risk profile..."}
              {ctx.phase === "recommending" && "Generating strategic scenarios and ranking recommendations..."}
              {ctx.phase === "idle" && "Initializing agent pipeline..."}
            </p>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
