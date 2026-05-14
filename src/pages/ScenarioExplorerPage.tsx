import AppLayout from "@/components/AppLayout";
import WhatIfSimulator from "@/components/WhatIfSimulator";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";

export default function ScenarioExplorerPage() {
  const { ctx } = useFarmContext();

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-5 pb-8">
        <section className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-900 via-slate-900 to-slate-800 p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-emerald-300 text-sm">science</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300">Live farm simulation</span>
          </div>
          <h1 className="font-headline text-3xl font-bold mb-1">What-if Farm Simulator</h1>
          <p className="text-sm text-emerald-100/75 max-w-2xl">
            Compare SmartPaddy's current recommendation with alternative farm actions before making a decision.
          </p>
        </section>

        <WhatIfSimulator ctx={ctx} />
      </div>
    </AppLayout>
  );
}
