import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";
import {
  createHarvestToMarketPlan,
  type DataSourceLabel,
  type HarvestReadinessStatus,
} from "@/lib/agents/harvestToMarketAgent";

const money = (value: number, currency = "RM") => `${currency} ${Math.round(value).toLocaleString()}`;
const kg = (value: number) => `${Math.round(value).toLocaleString()} kg`;
const ton = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} t`;

function SourceNote({ label }: { label: DataSourceLabel }) {
  return (
    <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      Data source: {label === "Live Agent" ? "Live agent" : "Demo preview"}
    </p>
  );
}

function StatusBadge({ status }: { status: HarvestReadinessStatus | string }) {
  const colors =
    status === "Harvest-ready"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Preparing" || status === "Ready to book"
        ? "bg-blue-100 text-blue-700"
        : "bg-slate-100 text-slate-500";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${colors}`}>
      {status}
    </span>
  );
}

function FlowStep({ number, title, detail, icon }: { number: number; title: string; detail: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-xs font-bold text-white">
          {number}
        </div>
        <span className="material-symbols-outlined text-base text-emerald-700">{icon}</span>
        <p className="text-xs font-bold text-slate-900">{title}</p>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}

function SummaryCard({ label, value, detail, icon, source }: { label: string; value: string; detail: string; icon: string; source?: DataSourceLabel }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-emerald-700">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <p className="font-headline text-xl font-bold leading-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{detail}</p>
      {source && <SourceNote label={source} />}
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 font-headline text-base font-bold text-slate-900">
        <span className="material-symbols-outlined text-lg text-emerald-700">{icon}</span>
        {title}
      </h2>
      {subtitle && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">{subtitle}</p>}
    </div>
  );
}

export default function HarvestPage() {
  const { ctx } = useFarmContext();
  const plan = createHarvestToMarketPlan(ctx);
  const [listingTab, setListingTab] = useState<"title" | "whatsapp" | "marketplace">("title");

  const liveYield = plan.batch.dataSource === "Live Agent";
  const checklistStatus = plan.batch.readinessStatus === "Harvest-ready"
    ? "ready"
    : plan.batch.readinessStatus === "Preparing"
      ? "prepare"
      : "pending";

  const primaryAction = liveYield ? "Prepare preorder draft" : "Generate buyer-ready listing draft";
  const recommendedStrategy = plan.strategies.find((strategy) => strategy.recommended)?.label ?? "Book milling service + prepare preorder draft";

  const harvestTasks = [
    { icon: "travel_explore", label: "Pre-harvest field inspection", status: checklistStatus === "pending" ? "pending" : "prepare", detail: "Walk field to check lodging, maturity, and harvest access." },
    { icon: "water_drop", label: "Stop irrigation 10-14 days before harvest", status: checklistStatus === "ready" ? "ready" : "pending", detail: "Drain field before cutting to support grain drying." },
    { icon: "humidity_percentage", label: "Confirm grain moisture 20-25%", status: checklistStatus === "ready" ? "ready" : "pending", detail: "Use a moisture meter before harvest decisions." },
    { icon: "local_shipping", label: "Book transport and drying facility", status: checklistStatus === "pending" ? "pending" : "prepare", detail: "Coordinate lorry timing and dryer intake slot." },
    { icon: "precision_manufacturing", label: "Confirm milling/packing partner", status: plan.processingPlan.processingStatus === "Ready to book" ? "prepare" : "pending", detail: "Confirm drying, milling, polishing, grading, and packing scope." },
    { icon: "qr_code_2", label: "Prepare preorder page only after processing schedule is confirmed", status: "pending", detail: "Keep preorder in draft until harvest and mill dates are locked." },
  ];

  const listingTabs = [
    { id: "title" as const, label: "Product title", content: plan.listingDraft.title },
    { id: "whatsapp" as const, label: "WhatsApp message", content: plan.listingDraft.whatsappSalesMessage },
    { id: "marketplace" as const, label: "Marketplace draft", content: plan.listingDraft.marketplaceDraft },
  ];
  const activeListing = listingTabs.find((tab) => tab.id === listingTab) ?? listingTabs[0];

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-5 pb-8 pt-2">
        <section className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 p-5 text-white shadow-lg md:p-7">
          <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-emerald-200">agriculture</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">Harvest intelligence</span>
              </div>
              <h1 className="font-headline text-3xl font-bold leading-tight">Harvest-to-Market Agent</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50/80">
                Plan harvest, processing, preorder, and buyer-ready listing from SmartPaddy field intelligence.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-50">
                  {primaryAction}
                </button>
                <span className="text-xs leading-relaxed text-emerald-50/75">
                  Draft only. Farmer confirms harvest date, miller schedule, pricing, and fulfillment.
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-100/80">Current plan</p>
              <p className="mt-2 font-headline text-xl font-bold">{plan.batch.fieldName}</p>
              <p className="text-xs text-emerald-50/75">{plan.batch.region}, {plan.batch.country}</p>
              <div className="my-4 h-px bg-white/10" />
              <p className="text-sm font-semibold leading-relaxed text-white">{plan.heroMessage}</p>
              <p className="mt-2 text-xs leading-relaxed text-emerald-50/70">
                SmartPaddy prepares sales material. Farmer remains in control of publishing, pricing, processing confirmation, and customer fulfillment.
              </p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-emerald-100/70">
                {plan.batch.dataSource === "Live Agent" ? "Live yield connected" : "Demo preview - run agent cycle first"}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <FlowStep number={1} icon="eco" title="Harvest Readiness" detail="Estimate harvest window, yield, and paddy volume." />
          <FlowStep number={2} icon="factory" title="Processing & Milling" detail="Book drying, milling, polishing, grading, and packing." />
          <FlowStep number={3} icon="shopping_bag" title="Sales / Preorder Draft" detail="Prepare a private processed-rice preorder draft." />
          <FlowStep number={4} icon="qr_code_2" title="Buyer Preview / QR" detail="Share only after harvest and processing dates are confirmed." />
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard
            icon="event"
            label="Harvest window"
            value={plan.batch.harvestWindow}
            detail={`${plan.batch.readinessStatus}. Grain target ${plan.batch.grainMoistureTarget}.`}
            source={plan.batch.dataSource}
          />
          <SummaryCard
            icon="grain"
            label="Expected paddy volume"
            value={ton(plan.batch.expectedPaddyVolumeTon)}
            detail={`${plan.batch.expectedYieldLabel}: ${plan.batch.expectedYieldTonPerHa} t/ha across ${plan.batch.fieldAreaHa} ha (${plan.batch.fieldAreaLabel}).`}
            source={plan.batch.fieldAreaSource}
          />
          <SummaryCard
            icon="factory"
            label="Processing partner"
            value={plan.processingPlan.suggestedPartner}
            detail={`${plan.processingPlan.partnerLabel}. ${plan.processingPlan.confirmationNote}`}
          />
          <SummaryCard
            icon="route"
            label="Recommended strategy"
            value={recommendedStrategy}
            detail="Processed rice preorder draft after milling schedule is confirmed."
          />
        </section>

        <section className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionTitle
                icon="factory"
                title="Processing & Milling Plan"
                subtitle="This is the real-world bridge from paddy prediction to customer-ready rice."
              />
              <div className="rounded-3xl bg-emerald-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Who dries and mills the rice?</p>
                <p className="mt-1 font-headline text-2xl font-bold text-slate-900">{plan.processingPlan.suggestedPartner}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Raw paddy must be dried, milled, polished, graded, and packed before customer sale. SmartPaddy only prepares the plan and draft materials.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusBadge status={plan.processingPlan.processingStatus} />
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">
                    {plan.processingPlan.processingService}
                  </span>
                </div>
                <p className="mt-3 text-[11px] font-semibold text-emerald-800">
                  {plan.processingPlan.confirmationNote}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard icon="payments" label="Processing fee" value={money(plan.processingPlan.estimatedProcessingFeeRM, plan.batch.currency)} detail="Estimate only. Confirm with miller before preorder." />
              <SummaryCard icon="percent" label="Rice recovery rate" value={`${plan.processingPlan.recoveryRatePct}%`} detail={`${plan.processingPlan.recoveryRateLabel}. Typical range is 62-68%.`} />
              <SummaryCard icon="rice_bowl" label="Finished rice quantity" value={kg(plan.processingPlan.estimatedFinishedRiceKg)} detail="Estimated sellable processed rice after milling." />
              <SummaryCard icon="inventory_2" label="Packing requirement" value="Required" detail="Pack by weight and batch before buyer fulfillment." />
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon="shopping_bag" title="Preorder Draft" subtitle="A private draft for processed rice interest. No customer login or payment." />
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard icon="draft" label="Draft status" value={plan.preorderDraft.status} detail="Not published automatically." />
              <SummaryCard icon="scale" label="Suggested quantity" value={kg(plan.preorderDraft.suggestedQuantityKg)} detail="Portion of finished rice reserved for early interest." />
              <SummaryCard icon="sell" label="Suggested price" value={`${plan.batch.currency} ${plan.preorderDraft.suggestedPricePerKgRM}/kg`} detail={plan.preorderDraft.revenueLabel} />
              <SummaryCard icon="monitoring" label="Estimated revenue" value={money(plan.preorderDraft.estimatedRevenueRM, plan.batch.currency)} detail="Planning estimate, not a payment record." />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Public preorder preview link</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-800">{plan.preorderDraft.publicLinkPreview}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{plan.preorderDraft.publicLinkLabel}</p>
            </div>
            <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-800">
              {plan.preorderDraft.warning}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon="auto_awesome" title="AI Listing Generator" subtitle="Draft copy only. SmartPaddy does not publish to Shopee, Lazada, or any marketplace." />
            <div className="flex flex-wrap gap-2">
              {listingTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setListingTab(tab.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    listingTab === tab.id
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{activeListing.label}</p>
              {listingTab === "marketplace" ? (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{activeListing.content}</pre>
              ) : (
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-800">{activeListing.content}</p>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Listing language uses traceable field record wording and avoids unsupported organic or freshness claims.
            </p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon="qr_code_2" title="Buyer Preview / QR" subtitle="A public preview card for buyers once the farmer chooses to share it." />
            <div className="rounded-[2rem] border border-emerald-100 bg-gradient-to-b from-white to-emerald-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rice batch</p>
                  <p className="font-headline text-xl font-bold text-slate-900">{plan.traceabilityRecord.batchId}</p>
                  <p className="mt-1 text-xs text-slate-500">{plan.traceabilityRecord.farmRegion}</p>
                </div>
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white">
                  <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 9 }).map((_, index) => (
                      <span key={index} className={`h-4 w-4 rounded-sm ${index % 2 === 0 ? "bg-slate-900" : "bg-slate-200"}`} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2 rounded-2xl bg-white p-3 text-xs">
                <p><span className="font-bold text-slate-700">Harvest window:</span> {plan.traceabilityRecord.harvestWindow}</p>
                <p><span className="font-bold text-slate-700">Processing status:</span> {plan.processingPlan.processingStatus}</p>
                <p><span className="font-bold text-slate-700">Processing date:</span> {plan.traceabilityRecord.processingDate}</p>
              </div>
              <SourceNote label={plan.traceabilityRecord.dataSource} />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon="fact_check" title="Data Source / Assumptions" subtitle="What is live, estimated, assumed, or preview-only in this harvest-to-market plan." />
            <div className="grid gap-3 md:grid-cols-2">
              {plan.assumptions.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-800">{item.label}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle icon="checklist" title="Harvest Preparation Checklist" subtitle="Operational support steps kept at the bottom so the market flow stays clear." />
            <div className="grid gap-3 md:grid-cols-2">
              {harvestTasks.map((task) => (
                <div key={task.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/40">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <span className="material-symbols-outlined text-base">{task.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{task.label}</p>
                    <p className="text-[11px] leading-relaxed text-slate-400">{task.detail}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${
                    task.status === "ready"
                      ? "bg-emerald-100 text-emerald-700"
                      : task.status === "prepare"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-400"
                  }`}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
        </section>
      </div>
    </AppLayout>
  );
}
