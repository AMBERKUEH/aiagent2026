import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createWhatIfSimulatorState, type DataSourceStatus, type WhatIfMetrics, type WhatIfScenarioId } from "@/lib/agents/whatIfSimulatorAgent";
import type { FarmContext } from "@/lib/agents/types";

const metricRows: Array<{ key: keyof WhatIfMetrics; label: string; unit?: string; prefix?: string }> = [
  { key: "expectedYieldTonPerHa", label: "Expected yield", unit: " t/ha" },
  { key: "projectedProfitRM", label: "Projected profit", prefix: "RM " },
  { key: "overallRisk", label: "Overall risk", unit: "%" },
  { key: "washoutRisk", label: "Washout risk", unit: "%" },
  { key: "operationalCostRM", label: "Operational cost", prefix: "RM " },
  { key: "waterUsageLiters", label: "Water usage", unit: " L" },
  { key: "confidence", label: "Confidence", unit: "%" },
];

function SourcePill({ status }: { status: DataSourceStatus }) {
  const classes = {
    "Live Agent": "bg-emerald-100 text-emerald-700",
    Assumption: "bg-amber-100 text-amber-700",
    Missing: "bg-red-100 text-red-700",
    "Demo Preview": "bg-slate-100 text-slate-500",
  }[status];

  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${classes}`}>{status}</span>;
}

function formatMetric(value: number, prefix = "", unit = "") {
  const formatted = Math.abs(value) >= 1000 ? Math.round(value).toLocaleString() : value.toLocaleString();
  return `${prefix}${formatted}${unit}`;
}

function deltaClass(delta: number, lowerIsBetter = false) {
  if (delta === 0) return "text-slate-400";
  const positive = lowerIsBetter ? delta < 0 : delta > 0;
  return positive ? "text-emerald-600" : "text-red-500";
}

export default function WhatIfSimulator({ ctx }: { ctx: FarmContext }) {
  const [scenarioId, setScenarioId] = useState<WhatIfScenarioId>("fertilize_today");
  const state = useMemo(() => createWhatIfSimulatorState(ctx, scenarioId), [ctx, scenarioId]);

  if (state.locked) {
    return (
      <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <span className="material-symbols-outlined text-2xl">lock</span>
          </div>
          <h2 className="font-headline text-2xl font-bold text-slate-900">Run AI Agent Cycle first</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{state.message}</p>
          <div className="mx-auto mt-5 max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Missing requirements</p>
            <div className="space-y-2">
              {state.missingRequirements.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <span className="material-symbols-outlined text-base text-amber-600">warning</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
          <Link to="/" className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-emerald-800">
            <span className="material-symbols-outlined text-base">neurology</span>
            Go to Today page
          </Link>
        </section>

        <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">Demo preview, clearly marked</summary>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Demo preview is intentionally collapsed. Live yield, risk, market, and sensor context are required before SmartPaddy shows real simulation outputs.
          </p>
        </details>
      </div>
    );
  }

  const selected = state.selected;
  const statusClasses = {
    Recommended: "bg-emerald-100 text-emerald-700",
    "Use with caution": "bg-amber-100 text-amber-700",
    "Not recommended": "bg-red-100 text-red-700",
  }[selected.conclusion.status];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ["Field", state.fieldName],
            ["Region", state.region],
            ["Area", `${state.fieldAreaHa} ha`],
            ["Paddy price", `RM ${state.basePriceRMPerKg.toFixed(2)}/kg`],
            ["Current plan", state.currentPlanName],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-headline text-lg font-bold text-slate-900">Alternative Action</h2>
            <p className="text-xs text-slate-500">Choose one action to compare against SmartPaddy's current plan.</p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Live-context simulation</span>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {state.scenarioOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setScenarioId(option.id)}
              className={`rounded-2xl border p-3 text-left transition ${
                scenarioId === option.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-emerald-700">{option.icon}</span>
                <p className="text-sm font-bold text-slate-900">{option.label}</p>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{option.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-headline text-lg font-bold text-slate-900">Current vs Alternative</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-3 text-left">Metric</th>
                  <th className="p-3 text-right">Current</th>
                  <th className="p-3 text-right">{selected.scenarioLabel}</th>
                  <th className="p-3 text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metricRows.map((row) => {
                  const current = selected.current[row.key];
                  const alternative = selected.alternative[row.key];
                  const delta = alternative - current;
                  const lowerIsBetter = ["overallRisk", "washoutRisk", "operationalCostRM", "waterUsageLiters"].includes(row.key);
                  return (
                    <tr key={row.key}>
                      <td className="p-3 font-semibold text-slate-700">{row.label}</td>
                      <td className="p-3 text-right font-bold text-slate-800">{formatMetric(current, row.prefix, row.unit)}</td>
                      <td className="p-3 text-right font-bold text-slate-800">{formatMetric(alternative, row.prefix, row.unit)}</td>
                      <td className={`p-3 text-right font-bold ${deltaClass(delta, lowerIsBetter)}`}>
                        {delta > 0 ? "+" : ""}{formatMetric(Math.round(delta * 100) / 100, row.prefix, row.unit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-headline text-lg font-bold text-slate-900">AI Conclusion</h2>
              <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClasses}`}>
                {selected.conclusion.status}
              </span>
            </div>
            <div className="space-y-3 text-sm leading-relaxed">
              <p><span className="font-bold text-slate-900">Why: </span><span className="text-slate-600">{selected.conclusion.why}</span></p>
              <p><span className="font-bold text-slate-900">Trade-off: </span><span className="text-slate-600">{selected.conclusion.tradeoff}</span></p>
              <p><span className="font-bold text-slate-900">Next action: </span><span className="text-slate-600">{selected.conclusion.nextAction}</span></p>
            </div>
          </section>

          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-base text-amber-700">verified_user</span>
              <p className="text-xs font-semibold leading-relaxed text-amber-800">{selected.safetyNote}</p>
            </div>
          </section>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-headline text-lg font-bold text-slate-900">Agent Influence</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {selected.agentInfluence.map((agent) => (
              <div key={agent.agentName} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-900">{agent.agentName}</p>
                  <SourcePill status={agent.status} />
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{agent.contribution}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-headline text-lg font-bold text-slate-900">Data Sources</h2>
          <div className="space-y-3">
            {selected.dataSources.map((source) => (
              <div key={source.label} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div>
                  <p className="text-xs font-bold text-slate-900">{source.label}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{source.detail}</p>
                </div>
                <SourcePill status={source.status} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
