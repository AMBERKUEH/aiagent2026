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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${isActive ? "bg-primary text-white shadow-lg scale-105 animate-pulse" :
                isDone ? "bg-emerald-100 text-emerald-700" :
                  "bg-slate-100 text-slate-400"
              }`}>
              <span className="material-symbols-outlined text-sm" style={isDone ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {isDone ? "check_circle" : isActive ? p.icon : p.icon}
              </span>
              <span className="hidden sm:inline">{p.label}</span>
            </div>
            {i < PHASES.length - 1 && (
              <div className={`w-6 h-0.5 rounded transition-colors duration-500 ${isDone ? "bg-emerald-300" : "bg-slate-200"
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
  const { ctx, isRunning, runCycle, lastCycleTime, hasLiveSensors, latestSensors } = useFarmContext();
  const navigate = useNavigate();
  const [goalType, setGoalType] = useState<GoalType>("balanced");
  const [budgetRM, setBudgetRM] = useState<number>(5000);

  // Auto-run on first mount
  useEffect(() => {
    if (ctx.phase === "idle" && !isRunning && hasLiveSensors) {
      runCycle();
    }
  }, [ctx.phase, hasLiveSensors, isRunning, runCycle]);

  const handleRunCycle = () => {
    const goal: UserGoal = {
      type: goalType,
      label: GOAL_PRESETS[goalType].label,
      budgetRM,
      constraints: [],
    };
    runCycle(goal);
  };

  const sensors = ctx.perception?.sensors ?? latestSensors;
  const recommendation = ctx.recommendation;
  const findings = ctx.findings;
  const riskProfile = ctx.riskProfile;
  const market = ctx.perception?.market ?? null;
  const yieldEstimate = ctx.yieldEstimate;

  // Sort findings: critical first, then warning, info, positive
  const sortedFindings = [...findings].sort((a, b) => {
    const order: Record<FindingSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  const newFindings = sortedFindings.filter(f => f.severity !== "positive").length;
  const activeAlerts = sortedFindings.filter(f => f.severity === "critical" || f.severity === "warning").slice(0, 3);
  const recommendedScenario = ctx.scenarioTree?.scenarios.find(s => s.isRecommended) ?? ctx.scenarioTree?.scenarios[0] ?? null;
  const hasRecommendationInputs = Boolean(ctx.yieldEstimate && ctx.perception?.market.status === "available");
  const statusTone = !hasLiveSensors
    ? { label: "Waiting for sensors", color: "text-amber-700", bg: "bg-amber-50", icon: "sensors_off" }
    : ctx.phase === "error" || ctx.errors.length > 0
      ? { label: "Partial intelligence", color: "text-amber-700", bg: "bg-amber-50", icon: "info" }
      : ctx.phase === "done"
        ? { label: "AI brief ready", color: "text-emerald-700", bg: "bg-emerald-50", icon: "verified" }
        : { label: "AI analyzing", color: "text-blue-700", bg: "bg-blue-50", icon: "neurology" };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6 pb-12">

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
                <h1 className="font-headline text-2xl font-bold">AI Command Center</h1>
                <p className="mt-1 max-w-xl text-xs text-white/60">
                  SmartPaddy continuously perceives farm signals, analyzes risk, and recommends the next best decision.
                </p>
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
                <div key={agent.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${agent.status === "running" ? "bg-primary/30 text-primary-foreground animate-pulse" :
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
        <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm mt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 block">Your Goal</label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {(Object.entries(GOAL_PRESETS) as [GoalType, typeof GOAL_PRESETS[GoalType]][]).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => setGoalType(key)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${goalType === key
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
            <div className="flex flex-wrap items-end gap-3">
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
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 shadow-lg shadow-primary/20 h-[38px]"
              >
                <span className={`material-symbols-outlined text-base ${isRunning ? "animate-spin" : ""}`}>
                  {isRunning ? "refresh" : "play_arrow"}
                </span>
                {isRunning ? "Analyzing..." : "Refresh AI Brief"}
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
                {recommendedScenario && (
                  <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Scenario Profit</p>
                      <p className="text-lg font-bold text-emerald-600">
                        RM {recommendedScenario.projections.profitRM.mid.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Yield</p>
                      <p className="text-lg font-bold text-slate-900">
                        {recommendedScenario.projections.yieldTonPerHa.mid} t/ha
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Risk Level</p>
                      <p className="text-lg font-bold text-slate-900">
                        {recommendedScenario.projections.climateRiskScore}%
                      </p>
                    </div>
                  </div>
                )}
                {recommendation.chain[0] && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <p className="text-xs text-slate-700 font-medium">
                      <span className="text-slate-400">Because: </span>{recommendation.chain[0].because}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      <span className="text-slate-400">Trade-off: </span>{recommendation.chain[0].tradeoff}
                    </p>
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2 text-xs text-primary font-semibold">
                  View Full Scenario Analysis
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {!recommendation && ctx.phase === "done" && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-700">lightbulb</span>
              <div>
                <h2 className="font-headline text-base font-semibold text-amber-950">Recommendation not ready yet</h2>
                <p className="mt-1 text-sm text-amber-800">
                  SmartPaddy has analyzed the available inputs, but a ranked strategy needs live sensors, backend yield prediction, and market price data.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-headline text-base font-semibold text-slate-900">Active Risk Alerts</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {activeAlerts.length} active
            </span>
          </div>
          {activeAlerts.length > 0 ? (
            <div className="space-y-2">
              {activeAlerts.map(alert => (
                <div key={alert.id} className={`rounded-xl border p-3 ${SEVERITY_STYLES[alert.severity]}`}>
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-base">{SEVERITY_ICONS[alert.severity]}</span>
                    <div>
                      <p className="text-xs font-bold">{alert.finding}</p>
                      <p className="mt-0.5 text-[11px] text-slate-600">{alert.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
              No active critical or warning alerts from the current agent cycle.
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Yield Forecast Agent</p>
                <h2 className="font-headline text-base font-semibold text-slate-900">Production Outlook</h2>
              </div>
              <span className="material-symbols-outlined text-primary">analytics</span>
            </div>
            {yieldEstimate ? (
              <div className="space-y-4">
                <div>
                  <p className="font-headline text-3xl font-bold text-slate-900">
                    {yieldEstimate.adjustedPrediction} <span className="text-sm font-normal text-slate-500">t/ha</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Range {yieldEstimate.confidenceBand.low} to {yieldEstimate.confidenceBand.high} t/ha | Model confidence {yieldEstimate.modelConfidence}%
                  </p>
                </div>
                {yieldEstimate.adjustments.length > 0 ? (
                  <div className="space-y-2">
                    {yieldEstimate.adjustments.slice(0, 3).map((adjustment, index) => (
                      <p key={`${adjustment.source}-${index}`} className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                        {adjustment.delta > 0 ? "+" : ""}{adjustment.delta} t/ha from {adjustment.reason}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    No cross-agent yield adjustment has been applied in the current cycle.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Yield forecast unavailable until the backend prediction API returns a real result.
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Economic Intelligence Agent</p>
                <h2 className="font-headline text-base font-semibold text-slate-900">Market Summary</h2>
              </div>
              <span className="material-symbols-outlined text-primary">payments</span>
            </div>
            {market?.status === "available" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Paddy Price</p>
                    <p className="mt-1 text-lg font-bold text-emerald-700">
                      {market.paddyPricePerKgRM === null ? "--" : `RM ${market.paddyPricePerKgRM.toFixed(2)}/kg`}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Demand</p>
                    <p className="mt-1 text-lg font-bold capitalize text-slate-900">{market.demandLevel ?? "--"}</p>
                  </div>
                </div>
                {market.fertilizers.length > 0 ? (
                  <div className="space-y-2">
                    {market.fertilizers.slice(0, 3).map(item => (
                      <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-xs">
                        <span className="font-semibold text-slate-800">{item.name}</span>
                        <span className="font-bold text-slate-900">RM {item.priceRM.toFixed(2)} ({item.trend})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Market API returned no fertilizer records.</p>
                )}
                <p className="text-[10px] text-slate-400">Source: {market.source}</p>
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                {market?.error ?? "Market data unavailable. Configure VITE_MARKET_API_URL to enable live economic intelligence."}
              </p>
            )}
          </div>
        </section>



        {/* ── Risk Overview ────────────────────────────────── */}
        {riskProfile && ctx.phase === "done" && (
          <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              {
                label: "Overall",
                value: riskProfile.overallRisk,
                color: riskProfile.overallRisk > 60 ? "#ef4444" : riskProfile.overallRisk > 30 ? "#f59e0b" : "#22c55e",
                icon: "shield",
                meaning: "The aggregated threat level across all farm signals.",
                interpretation: "Below 30% is Optimal (Good). 30-60% requires monitoring. Above 60% indicates a critical threat requiring immediate action."
              },
              {
                label: "Flood",
                value: riskProfile.floodRisk,
                color: "#3b82f6",
                icon: "flood",
                meaning: "Probability of field inundation based on rain forecast and soil saturation.",
                interpretation: "Low (0-20%) is safe. High values suggest you should check drainage and bunding."
              },
              {
                label: "Drought",
                value: riskProfile.droughtRisk,
                color: "#f59e0b",
                icon: "local_fire_department",
                meaning: "Risk of water stress due to high evaporation and low water input.",
                interpretation: "Optimal is below 20%. Higher values indicate your crop might need supplemental irrigation."
              },
              {
                label: "Disease",
                value: riskProfile.diseaseRisk,
                color: "#ef4444",
                icon: "coronavirus",
                meaning: "Likelihood of pest or fungal outbreaks from scans and weather conditions.",
                interpretation: "0-15% is healthy. Spikes here suggest you should schedule a preventive spray."
              },
              {
                label: "Market",
                value: riskProfile.marketRisk,
                color: "#8b5cf6",
                icon: "trending_up",
                meaning: "Potential impact of price drops or input cost spikes on your profit.",
                interpretation: "Low risk means stable profits. High risk suggests locking in prices early."
              },
            ].map(r => {
              const interpretation = r.value <= 20 
                ? `Currently ${r.value}%, which is Optimal (Good). No immediate action is required.`
                : r.value <= 50 
                ? `Currently ${r.value}%, which is Moderate. You should monitor sensor trends closely.`
                : `Currently ${r.value}%, which is High. Immediate intervention or strategy adjustment is recommended.`;

              return (
                <Tooltip key={r.label} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex flex-col cursor-help transition-all hover:border-primary/30 hover:shadow-md group">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="material-symbols-outlined text-sm transition-transform group-hover:scale-110" style={{ color: r.color }}>{r.icon}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{r.label}</span>
                      </div>
                      <p className="font-headline text-2xl font-bold text-slate-900 leading-none">{r.value}<span className="text-sm text-slate-400 font-normal">%</span></p>
                      <div className="mt-auto pt-4">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.value}%`, background: r.color }} />
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[240px] p-4 bg-white/90 backdrop-blur-md text-slate-900 border-slate-200 shadow-2xl rounded-2xl">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm" style={{ color: r.color }}>{r.icon}</span>
                        <p className="font-bold text-xs uppercase tracking-wider">{r.label} Risk</p>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{r.meaning}</p>
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">AI Assessment</p>
                        <p className={`text-[11px] leading-relaxed font-medium ${r.value > 50 ? "text-red-500" : r.value > 20 ? "text-amber-500" : "text-emerald-600"}`}>
                          {interpretation}
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
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

        {/* ── Live Sensor Perception ────────────────────────── */}
        {sensors && (
          <section className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-500">sensors</span>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Live Sensors</h3>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse ml-1" />
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Auto-refresh: 1s</span>
            </div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
              {[
                { id: "humidity", label: "Humidity", unit: "%", icon: "humidity_percentage", min: 70, max: 85, meaning: "Air water vapor level. High humidity (>85%) increases fungal risk." },
                { id: "lightIntensity", label: "Light", unit: "lux", icon: "wb_sunny", min: 2000, max: 100000, meaning: "Solar intensity. Essential for growth; very high values might lead to heat stress." },
                { id: "soilMoisture", label: "Soil Moisture", unit: "%", icon: "water_drop", min: 65, max: 80, meaning: "Root zone water content. Paddy needs >65% for optimal growth." },
                { id: "temperature", label: "Temperature", unit: "°C", icon: "thermostat", min: 25, max: 35, meaning: "Ambient air temp. Paddy grows best between 25°C and 35°C." },
                { id: "waterLevel", label: "Water Level", unit: "cm", icon: "waves", min: 5, max: 15, meaning: "Water depth in plot. Keep between 5-15cm for optimal weed control." },
              ].map(cfg => {
                const val = (sensors as any)[cfg.id];
                const isOptimal = val === null || (val >= cfg.min && val <= cfg.max);
                const isCritical = val !== null && (val < cfg.min * 0.8 || val > cfg.max * 1.2);
                
                const statusColor = isCritical ? "text-red-600 bg-red-50 border-red-100" : isOptimal ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-amber-600 bg-amber-50 border-amber-100";
                const dotColor = isCritical ? "bg-red-500" : isOptimal ? "bg-emerald-500" : "bg-amber-500";
                const interpretation = isCritical 
                   ? `Currently ${val}${cfg.unit}, which is dangerously outside the ideal range.` 
                   : isOptimal 
                   ? `Currently ${val}${cfg.unit}, which is well within the optimal range.` 
                   : `Currently ${val}${cfg.unit}, which is slightly outside the ideal range; monitor closely.`;

                return (
                  <Tooltip key={cfg.id} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <div className={`relative p-4 rounded-2xl border transition-all hover:shadow-md cursor-help group ${isCritical ? "border-red-200 bg-white" : isOptimal ? "border-emerald-100 bg-white" : "border-amber-100 bg-white"}`}>
                        {isCritical && (
                          <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 shadow-sm animate-bounce">
                            <span className="material-symbols-outlined text-[10px] text-white font-bold">priority_high</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] uppercase tracking-widest font-bold ${isCritical ? "text-red-500" : isOptimal ? "text-emerald-600" : "text-amber-600"}`}>{cfg.label}</span>
                          <div className={`h-1.5 w-1.5 rounded-full ${dotColor} ${isCritical ? "animate-pulse" : ""}`} />
                        </div>
                        <div className="flex items-end gap-1">
                          <span className="text-2xl font-bold text-slate-800 leading-none">{val ?? "--"}</span>
                          <span className="text-xs text-slate-400 font-bold mb-0.5">{cfg.unit}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${statusColor}`}>
                            {isCritical ? "Care Needed" : isOptimal ? "Optimal" : "Monitor"}
                          </span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] p-4 bg-white/90 backdrop-blur-md text-slate-900 border-slate-200 shadow-2xl rounded-2xl">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm text-primary">{cfg.icon}</span>
                          <p className="font-bold text-xs uppercase tracking-wider">{cfg.label}</p>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{cfg.meaning}</p>
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">AI Assessment</p>
                          <p className={`text-[11px] leading-relaxed font-medium ${isCritical ? "text-red-500" : isOptimal ? "text-emerald-600" : "text-amber-600"}`}>
                            {interpretation}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400 font-medium">Target: {cfg.min} - {cfg.max} {cfg.unit}</p>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
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

        {!isRunning && ctx.errors.length > 0 && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-700">info</span>
              <div>
                <h2 className="font-headline text-base font-semibold text-amber-950">Some intelligence is unavailable</h2>
                <div className="mt-2 space-y-1">
                  {ctx.errors.map((error, index) => (
                    <p key={`${error.agentId}-${index}`} className="text-sm text-amber-800">
                      {error.message}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {!hasLiveSensors && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <span className="material-symbols-outlined text-3xl text-slate-400">sensors_off</span>
            <p className="mt-2 text-sm font-semibold text-slate-700">Waiting for live Firebase sensors</p>
            <p className="mt-1 text-xs text-slate-500">
              Agent cycles start only after real readings are available at /sensor_history.
            </p>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
