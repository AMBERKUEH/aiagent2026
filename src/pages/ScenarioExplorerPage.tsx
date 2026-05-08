// ============================================================
// Scenario Explorer Page
// ============================================================
// The wow moment: side-by-side strategy comparison with
// transparent reasoning chains and goal-aligned scoring.
// ============================================================

import AppLayout from "@/components/AppLayout";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";
import { GOAL_PRESETS, type GoalType, type ScenarioNode, type UserGoal } from "@/lib/agents/types";
import { useState } from "react";

// ── Metric bar ──────────────────────────────────────────────

function MetricBar({ label, value, max, unit, color, inverted }: {
  label: string; value: number; max: number; unit?: string; color: string; inverted?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const displayPct = inverted ? 100 - pct : pct;
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-slate-500 font-medium">{label}</span>
        <span className="font-bold text-slate-700">{typeof value === "number" ? value.toLocaleString() : value}{unit ?? ""}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${displayPct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Scenario Card ───────────────────────────────────────────

function ScenarioCard({
  scenario,
  isExpanded,
  onToggle,
}: {
  scenario: ScenarioNode;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const proj = scenario.projections;

  return (
    <div
      className={`rounded-2xl border-2 transition-all cursor-pointer ${
        scenario.isRecommended
          ? "border-primary bg-primary/[0.02] shadow-lg shadow-primary/10"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
      onClick={onToggle}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: scenario.color + "18" }}>
              <span className="material-symbols-outlined text-lg" style={{ color: scenario.color }}>{scenario.icon}</span>
            </div>
            <div>
              <h3 className="font-headline text-base font-bold text-slate-900">{scenario.name}</h3>
              <p className="text-[10px] text-slate-400 font-medium">{scenario.nameBM}</p>
            </div>
          </div>
          {scenario.isRecommended && (
            <span className="flex items-center gap-1 rounded-full bg-primary text-white px-3 py-1 text-[10px] font-bold uppercase tracking-wider shadow">
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              Recommended
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">{scenario.description}</p>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Yield</span>
            <p className="font-headline text-xl font-bold text-slate-900">{proj.yieldTonPerHa.mid} <span className="text-xs text-slate-400 font-normal">t/ha</span></p>
            <p className="text-[10px] text-slate-400">{proj.yieldTonPerHa.low} – {proj.yieldTonPerHa.high}</p>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Profit</span>
            <p className="font-headline text-xl font-bold text-emerald-700">RM {proj.profitRM.mid.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">RM {proj.profitRM.low.toLocaleString()} – {proj.profitRM.high.toLocaleString()}</p>
          </div>
        </div>

        {/* Score bars */}
        <div className="space-y-2">
          <MetricBar label="Goal Alignment" value={scenario.goalAlignmentScore} max={100} unit="%" color={scenario.color} />
          <MetricBar label="Climate Risk" value={proj.climateRiskScore} max={100} unit="%" color="#ef4444" inverted />
          <MetricBar label="Sustainability" value={proj.sustainabilityScore} max={100} unit="%" color="#22c55e" />
          <MetricBar label="Op. Cost" value={proj.operationalCostRM} max={3000} unit=" RM" color="#f59e0b" inverted />
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-5 space-y-5">
          {/* Actions */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">checklist</span>
              Prescribed Actions
            </h4>
            <div className="space-y-2">
              {scenario.actions.map((a, i) => (
                <div key={i} className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">{a.action}</p>
                    <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">RM {a.costRM}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{a.timing} · {a.rationale}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Reasoning chain */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">psychology</span>
              Reasoning Chain
            </h4>
            <div className="space-y-2">
              {scenario.reasoning.map((r, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">{r.step}</div>
                    {i < scenario.reasoning.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                  </div>
                  <div className="pb-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{r.agentName} · {r.confidence}%</p>
                    <p className="text-xs text-slate-700 font-medium mt-0.5">{r.observation}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 italic">{r.inference}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Assumptions & breakpoints */}
          {scenario.breakpoints.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">warning</span>
                Re-evaluation Triggers
              </p>
              {scenario.breakpoints.map((bp, i) => (
                <p key={i} className="text-xs text-amber-800 mt-0.5">· {bp}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────

export default function ScenarioExplorerPage() {
  const { ctx, isRunning, runCycle } = useFarmContext();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<GoalType>(ctx.userGoal?.type ?? "balanced");
  const [budgetRM, setBudgetRM] = useState<number>(ctx.userGoal?.budgetRM ?? 5000);

  const tree = ctx.scenarioTree;
  const recommendation = ctx.recommendation;

  const handleRegenerate = () => {
    const goal: UserGoal = {
      type: goalType,
      label: GOAL_PRESETS[goalType].label,
      budgetRM,
      constraints: [],
    };
    runCycle(goal);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-5 pb-8">

        {/* Header */}
        <section className="rounded-2xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-800 p-6 text-white">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-indigo-300 text-sm">account_tree</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-300">Scenario Tree Simulation</span>
          </div>
          <h1 className="font-headline text-2xl font-bold mb-1">Strategic Pathway Explorer</h1>
          <p className="text-sm text-indigo-200/70 max-w-lg">
            Compare multiple future strategies. Each scenario projects yield, profit, cost, and risk based on current farm state and your goal.
          </p>
        </section>

        {/* Goal selector */}
        <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 block">Optimize For</label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(GOAL_PRESETS) as [GoalType, typeof GOAL_PRESETS[GoalType]][]).map(([key, preset]) => (
                  <button key={key} onClick={() => setGoalType(key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
                      goalType === key ? "bg-indigo-600 text-white shadow" : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
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
                <input type="number" value={budgetRM} onChange={e => setBudgetRM(Number(e.target.value) || 0)}
                  className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <button onClick={handleRegenerate} disabled={isRunning}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-50 shadow">
                <span className={`material-symbols-outlined text-base ${isRunning ? "animate-spin" : ""}`}>
                  {isRunning ? "refresh" : "autorenew"}
                </span>
                {isRunning ? "Generating..." : "Re-simulate"}
              </button>
            </div>
          </div>
        </section>

        {/* Explanation banner */}
        {recommendation && (
          <section className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/50 p-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-indigo-600 text-xl mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <div>
                <h3 className="font-headline text-sm font-bold text-indigo-900 mb-1">
                  Why {recommendation.strategyName}?
                </h3>
                <p className="text-xs text-indigo-800 leading-relaxed">{recommendation.summary}</p>
                {recommendation.chain[0] && (
                  <div className="mt-2 space-y-1 text-[11px] font-mono text-indigo-700">
                    <p><span className="text-indigo-400">→ because:</span> {recommendation.chain[0].because}</p>
                    <p><span className="text-indigo-400">→ which means:</span> {recommendation.chain[0].whichMeans}</p>
                    <p><span className="text-indigo-400">→ so instead:</span> {recommendation.chain[0].soInstead}</p>
                    <p><span className="text-indigo-400">→ trade-off:</span> {recommendation.chain[0].tradeoff}</p>
                  </div>
                )}
                {recommendation.contributors.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {recommendation.contributors.map((c, i) => (
                      <span key={i} className="rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-0.5 text-[10px] font-bold">
                        {c.agentName}: {Math.round(c.weight * 100)}% influence
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Scenario grid */}
        {tree && tree.scenarios.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {tree.scenarios.map(s => (
              <ScenarioCard
                key={s.id}
                scenario={s}
                isExpanded={expandedId === s.id}
                onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {(!tree || tree.scenarios.length === 0) && !isRunning && (
          <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-300 mb-3 block">account_tree</span>
            <p className="text-sm text-slate-500">Run an agent cycle from the Command Center to generate scenario comparisons.</p>
          </div>
        )}

        {/* Loading */}
        {isRunning && (
          <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center">
            <span className="material-symbols-outlined text-4xl text-indigo-500 animate-spin mb-3 block">neurology</span>
            <p className="text-sm text-slate-500">Generating strategic pathways from current farm context...</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
