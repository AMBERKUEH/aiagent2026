import AppLayout from "@/components/AppLayout";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";

export default function HarvestPage() {
  const { ctx } = useFarmContext();
  const yieldEst = ctx.yieldEstimate;
  const recommendation = ctx.recommendation;

  const harvestTasks = [
    { icon: "agriculture", label: "Pre-harvest field inspection", status: "pending", detail: "Walk field to check lodging and maturity" },
    { icon: "water_drop", label: "Stop irrigation", status: "pending", detail: "Drain field 10–14 days before harvest" },
    { icon: "content_cut", label: "Harvest at 20–25% grain moisture", status: "pending", detail: "Use moisture meter to confirm readiness" },
    { icon: "local_shipping", label: "Arrange transport & drying", status: "pending", detail: "Book lorry and drying facility" },
    { icon: "inventory_2", label: "Post-harvest grain storage", status: "pending", detail: "Store in dry, ventilated area below 14% moisture" },
  ];

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-5 pb-8 pt-2">
        {/* Header */}
        <section className="rounded-3xl bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800 p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.05) 20px, rgba(255,255,255,0.05) 40px)" }} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-amber-200 text-sm">agriculture</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-200">Harvest Planning</span>
            </div>
            <h1 className="font-headline text-2xl font-bold">Harvest Dashboard</h1>
            <p className="text-sm text-amber-100/80 mt-1 max-w-md">
              Plan and track your paddy harvest. Monitor yield projections and checklist items.
            </p>
          </div>
        </section>

        {/* Yield Projection */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Yield</span>
            <p className="font-headline text-3xl font-bold text-slate-900 mt-1">
              {yieldEst ? `${yieldEst.adjustedPrediction}` : "--"}<span className="text-sm text-slate-400 ml-1">t/ha</span>
            </p>
            {yieldEst && (
              <p className="text-[11px] text-slate-500 mt-1">
                Base: {yieldEst.basePrediction} t/ha · Confidence: {yieldEst.modelConfidence}%
              </p>
            )}
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimated Revenue</span>
            <p className="font-headline text-3xl font-bold text-emerald-700 mt-1">
              {yieldEst && ctx.perception?.market?.paddyPricePerKgRM
                ? `RM ${Math.round(yieldEst.adjustedPrediction * 1000 * ctx.perception.market.paddyPricePerKgRM).toLocaleString()}`
                : "--"
              }
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {ctx.perception?.market?.paddyPricePerKgRM
                ? `At RM ${ctx.perception.market.paddyPricePerKgRM}/kg market price`
                : "Market price unavailable"}
            </p>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Strategy</span>
            <p className="font-headline text-lg font-bold text-slate-900 mt-1 leading-tight">
              {recommendation?.strategyName ?? "Run agent cycle first"}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
              {recommendation?.summary ?? "SmartPaddy needs to analyze your field before harvest planning."}
            </p>
          </div>
        </div>

        {/* Harvest Checklist */}
        <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="font-headline text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600 text-base">checklist</span>
            Harvest Preparation Checklist
          </h3>
          <div className="space-y-3">
            {harvestTasks.map((task, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 transition-all">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                  <span className="material-symbols-outlined text-base">{task.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{task.label}</p>
                  <p className="text-[11px] text-slate-400">{task.detail}</p>
                </div>
                <span className="rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase bg-slate-100 text-slate-400">
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Yield adjustments from agents */}
        {yieldEst && yieldEst.adjustments.length > 0 && (
          <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <h3 className="font-headline text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-600 text-base">tune</span>
              Yield Adjustments by Agent
            </h3>
            <div className="space-y-2">
              {yieldEst.adjustments.map((a, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-600 truncate flex-1">{a.reason}</span>
                  <span className={`font-mono text-xs font-bold ml-3 ${a.delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {a.delta >= 0 ? "+" : ""}{a.delta.toFixed(2)} t/ha
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-primary/5 border border-primary/10 font-bold">
                <span className="text-xs text-primary">Final Adjusted Yield</span>
                <span className="text-sm text-primary">{yieldEst.adjustedPrediction} t/ha</span>
              </div>
            </div>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
