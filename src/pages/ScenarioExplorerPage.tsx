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
    <div className="group/metric">
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="text-slate-500 font-semibold group-hover/metric:text-slate-700 transition-colors">{label}</span>
        <span className="font-bold text-slate-800 bg-slate-50 px-1.5 rounded-md border border-slate-100">
          {typeof value === "number" ? value.toLocaleString() : value}{unit ?? ""}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden p-[1px]">
        <div 
          className="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(0,0,0,0.05)]" 
          style={{ width: `${displayPct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})` }} 
        />
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
      className={`relative flex flex-col rounded-3xl border-2 transition-all duration-300 overflow-hidden ${
        isExpanded ? "md:col-span-2 shadow-2xl ring-4 ring-primary/5" : "hover:shadow-xl hover:-translate-y-1 active:scale-[0.98]"
      } ${
        scenario.isRecommended
          ? "border-primary bg-gradient-to-br from-primary/[0.03] to-transparent"
          : "border-slate-200 bg-white hover:border-primary/30"
      }`}
      onClick={onToggle}
    >
      {/* Header Decoration */}
      <div 
        className="absolute top-0 left-0 right-0 h-1" 
        style={{ background: `linear-gradient(90deg, ${scenario.color}, ${scenario.color}33)` }} 
      />

      {/* Main Content */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-inner" style={{ background: scenario.color + "15" }}>
              <span className="material-symbols-outlined text-2xl" style={{ color: scenario.color }}>{scenario.icon}</span>
            </div>
            <div>
              <h3 className="font-headline text-lg font-bold text-slate-900 leading-tight">{scenario.name}</h3>
              <p className="text-xs text-slate-400 font-medium tracking-wide mt-0.5">{scenario.nameBM}</p>
            </div>
          </div>
          {scenario.isRecommended && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary text-white px-4 py-1.5 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              TOP PICK
            </span>
          )}
        </div>

        <p className="text-sm text-slate-600 mb-6 leading-relaxed line-clamp-2 italic">"{scenario.description}"</p>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 group transition-colors hover:bg-slate-50">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Expected Yield</span>
            <div className="flex items-baseline gap-1.5">
              <p className="font-headline text-2xl font-black text-slate-900">{proj.yieldTonPerHa.mid}</p>
              <span className="text-xs text-slate-400 font-bold uppercase">t/ha</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-slate-400 rounded-full" style={{ width: '70%' }} />
              </div>
              <span className="text-[10px] text-slate-400 whitespace-nowrap font-medium">{proj.yieldTonPerHa.low}-{proj.yieldTonPerHa.high}</span>
            </div>
          </div>
          <div className="bg-emerald-50/30 rounded-2xl p-4 border border-emerald-100 group transition-colors hover:bg-emerald-50/50">
            <span className="text-[10px] text-emerald-600/70 font-bold uppercase tracking-widest block mb-1">Projected Profit</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-emerald-600 font-bold">RM</span>
              <p className="font-headline text-2xl font-black text-emerald-700">{proj.profitRM.mid.toLocaleString()}</p>
            </div>
            <p className="text-[10px] text-emerald-600/50 font-medium mt-1">Range: {proj.profitRM.low.toLocaleString()} - {proj.profitRM.high.toLocaleString()}</p>
          </div>
        </div>

        {/* Score bars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <MetricBar label="Goal Alignment" value={scenario.goalAlignmentScore} max={100} unit="%" color={scenario.color} />
          <MetricBar label="Sustainability" value={proj.sustainabilityScore} max={100} unit="%" color="#22c55e" />
          <MetricBar label="Climate Risk" value={proj.climateRiskScore} max={100} unit="%" color="#ef4444" inverted />
          <MetricBar label="Op. Cost" value={proj.operationalCostRM} max={3000} unit=" RM" color="#f59e0b" inverted />
        </div>
        
        <div className="mt-6 flex justify-center">
          <button className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline uppercase tracking-tighter">
            {isExpanded ? "Collapse Details" : "View Full Strategy Chain"}
            <span className="material-symbols-outlined text-sm">{isExpanded ? "expand_less" : "expand_more"}</span>
          </button>
        </div>
      </div>

      {/* Expanded details with background pattern */}
      {isExpanded && (
        <div className="relative bg-slate-50/50 border-t border-slate-100 p-6 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />
          
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Actions */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-sm text-primary">task_alt</span>
                </div>
                Execution Roadmap
              </h4>
              <div className="space-y-3">
                {scenario.actions.map((a, i) => (
                  <div key={i} className="group/action rounded-2xl bg-white p-4 border border-slate-200 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800 group-hover/action:text-primary transition-colors">{a.action}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{a.actionBM}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-slate-700 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">RM {a.costRM}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      <span className="font-bold">{a.timing}</span>
                      <span className="text-slate-300">|</span>
                      <span className="italic">{a.rationale}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reasoning chain */}
            <div>
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-sm text-primary">psychology</span>
                </div>
                Reasoning Logic
              </h4>
              <div className="space-y-4">
                {scenario.reasoning.map((r, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white border-2 border-slate-200 text-xs font-black text-slate-600 shadow-sm">{r.step}</div>
                      {i < scenario.reasoning.length - 1 && <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-200 to-transparent my-2" />}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-primary uppercase tracking-tighter">{r.agentName}</span>
                        <div className="flex-1 h-[1px] bg-slate-100" />
                        <span className="text-[10px] font-bold text-slate-400">{r.confidence}% confidence</span>
                      </div>
                      <p className="text-xs text-slate-700 font-bold">{r.observation}</p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed bg-white/50 p-2 rounded-xl border border-slate-100/50 italic">{r.inference}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Re-evaluation Triggers */}
          {scenario.breakpoints.length > 0 && (
            <div className="rounded-3xl bg-amber-500/5 border border-amber-500/20 p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-700 mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-base">report_problem</span>
                Critical Strategy Breakpoints
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {scenario.breakpoints.map((bp, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white/60 p-2.5 rounded-2xl border border-amber-500/10">
                    <span className="material-symbols-outlined text-amber-500 text-xs mt-0.5">report_problem</span>
                    <p className="text-xs text-amber-900 font-medium">{bp}</p>
                  </div>
                ))}
              </div>
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {(Object.entries(GOAL_PRESETS) as [GoalType, typeof GOAL_PRESETS[GoalType]][]).map(([key, preset]) => (
                  <button key={key} onClick={() => setGoalType(key)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
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
                    <p><span className="text-indigo-400">Because:</span> {recommendation.chain[0].because}</p>
                    <p><span className="text-indigo-400">Which means:</span> {recommendation.chain[0].whichMeans}</p>
                    <p><span className="text-indigo-400">So instead:</span> {recommendation.chain[0].soInstead}</p>
                    <p><span className="text-indigo-400">Trade-off:</span> {recommendation.chain[0].tradeoff}</p>
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
          <div className="grid gap-6 md:grid-cols-2 items-start">
            {[...tree.scenarios]
              .sort((a, b) => (a.id === expandedId ? -1 : b.id === expandedId ? 1 : 0))
              .map(s => (
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
