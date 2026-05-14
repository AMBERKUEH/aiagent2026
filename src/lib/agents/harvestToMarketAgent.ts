import type { FarmContext } from "./types";

export type HarvestReadinessStatus = "Not ready" | "Preparing" | "Harvest-ready";
export type DataSourceLabel = "Live Agent" | "Demo Mode";
export type AssumptionStatus = "Live agent" | "Live market" | "Estimated" | "Demo preview" | "Planning assumption" | "Preview only";

export interface HarvestBatch {
  batchId: string;
  fieldName: string;
  region: string;
  country: string;
  currency: string;
  fieldAreaHa: number;
  fieldAreaSource: DataSourceLabel;
  fieldAreaLabel: "Farm profile" | "Demo field area";
  harvestWindow: string;
  expectedYieldTonPerHa: number;
  expectedYieldLabel: "Live yield estimate" | "Run agent cycle first";
  expectedPaddyVolumeTon: number;
  grainMoistureTarget: string;
  readinessStatus: HarvestReadinessStatus;
  confidence: number;
  dataSource: DataSourceLabel;
}

export interface ProcessingPlan {
  dryingRequired: boolean;
  millingRequired: boolean;
  polishingRequired: boolean;
  packingRequired: boolean;
  suggestedPartner: string;
  partnerLabel: "Suggested partner / demo" | "Farm profile partner";
  processingService: string;
  estimatedProcessingFeeRM: number;
  recoveryRate: number;
  recoveryRatePct: number;
  recoveryRateLabel: "Planning assumption" | "Verified recovery rate";
  estimatedFinishedRiceKg: number;
  processingStatus: "Not booked" | "Ready to book" | "Booked";
  note: string;
  confirmationNote: string;
}

export interface SellingStrategy {
  id: "raw_paddy" | "processed_rice" | "preorder";
  label: string;
  effort: string;
  margin: string;
  description: string;
  recommended: boolean;
}

export interface PreorderDraft {
  status: "Draft";
  published: false;
  suggestedQuantityKg: number;
  suggestedPricePerKgRM: number;
  estimatedRevenueRM: number;
  revenueLabel: "Estimated from live market context" | "Estimated from market fallback" | "Estimated with Demo Mode pricing";
  pickupDeliveryNote: string;
  publicLinkPreview: string;
  publicLinkLabel: "Preview only";
  qrLabel: string;
  whatsappInterestForm: string;
  warning: string;
}

export interface ListingDraft {
  title: string;
  shortDescription: string;
  whatsappSalesMessage: string;
  marketplaceDraft: string;
}

export interface TraceabilityRecord {
  batchId: string;
  farmRegion: string;
  harvestWindow: string;
  processingDate: string;
  processingStatus: string;
  fieldSummary: string;
  dataSource: DataSourceLabel;
}

export interface HarvestAssumption {
  label: string;
  status: AssumptionStatus;
  detail: string;
}

export interface HarvestToMarketPlan {
  heroMessage: string;
  mainHarvestStrategy: string;
  agentStatus: string;
  marketLabel: DataSourceLabel;
  marketPriceStatus: "Live market" | "Estimated" | "Demo preview";
  batch: HarvestBatch;
  processingPlan: ProcessingPlan;
  strategies: SellingStrategy[];
  preorderDraft: PreorderDraft;
  listingDraft: ListingDraft;
  traceabilityRecord: TraceabilityRecord;
  assumptions: HarvestAssumption[];
}

const DEMO_FIELD_AREA_HA = 1.2;
const DEMO_YIELD_TON_PER_HA = 5.8;
const DEFAULT_RECOVERY_RATE = 0.65;
const PROCESSING_FEE_PER_TON_RM = 280;

const round = (value: number, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });

const getOptionalNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
};

const getOptionalString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const isDemoMarket = (source?: string | null) => {
  const value = String(source ?? "").toLowerCase();
  return value.includes("mock") || value.includes("fallback") || value.includes("demo");
};

const clampRecoveryRate = (value: number | null) => {
  if (value === null) return DEFAULT_RECOVERY_RATE;
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(0.68, Math.max(0.62, normalized));
};

export function createHarvestToMarketPlan(ctx: FarmContext): HarvestToMarketPlan {
  const farmProfile = (ctx.farmProfile ?? {}) as Record<string, unknown>;
  const regionContext = (ctx.regionContext ?? {}) as Record<string, unknown>;
  const market = ctx.perception?.market ?? null;
  const hasLiveYield = Boolean(ctx.yieldEstimate);

  const fieldName = getOptionalString(
    farmProfile.fieldName,
    farmProfile.name,
    farmProfile.field_label,
  ) ?? "Paddy Field 3A";

  const region = getOptionalString(
    ctx.regionContext?.region,
    ctx.regionContext?.state,
    regionContext.name,
    ctx.farmProfile?.region,
  ) ?? "Kedah";

  const country = getOptionalString(ctx.regionContext?.country, ctx.farmProfile?.country) ?? "Malaysia";
  const currency = getOptionalString(ctx.regionContext?.currency, ctx.farmProfile?.currency) ?? "RM";

  const fieldArea = getOptionalNumber(
    ctx.farmProfile?.fieldAreaHa,
    farmProfile.areaHa,
    farmProfile.area_ha,
    farmProfile.hectares,
  );
  const fieldAreaHa = fieldArea ?? DEMO_FIELD_AREA_HA;
  const fieldAreaSource: DataSourceLabel = fieldArea ? "Live Agent" : "Demo Mode";
  const fieldAreaLabel: HarvestBatch["fieldAreaLabel"] = fieldArea ? "Farm profile" : "Demo field area";

  const yieldTonPerHa = ctx.yieldEstimate?.adjustedPrediction ?? DEMO_YIELD_TON_PER_HA;
  const expectedPaddyVolumeTon = round(yieldTonPerHa * fieldAreaHa, 2);
  const confidence = ctx.yieldEstimate?.modelConfidence ?? 0;

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() + (hasLiveYield ? 21 : 30));
  const end = new Date(today);
  end.setDate(today.getDate() + (hasLiveYield ? 35 : 44));
  const harvestWindow = `${formatDate(start)} - ${formatDate(end)}`;

  const readinessStatus: HarvestReadinessStatus = !hasLiveYield
    ? "Not ready"
    : confidence >= 75
      ? "Preparing"
      : "Not ready";

  const batchId = `SP-${region.replace(/\s+/g, "").toUpperCase()}-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-3A`;

  const profileRecoveryRate = getOptionalNumber(
    farmProfile.riceRecoveryRate,
    farmProfile.recoveryRate,
    farmProfile.millingRecoveryRate,
  );
  const recoveryRate = clampRecoveryRate(profileRecoveryRate);
  const recoveryRateLabel: ProcessingPlan["recoveryRateLabel"] = profileRecoveryRate ? "Verified recovery rate" : "Planning assumption";
  const recoveryRatePct = Math.round(recoveryRate * 100);
  const estimatedFinishedRiceKg = Math.round(expectedPaddyVolumeTon * 1000 * recoveryRate);
  const estimatedProcessingFeeRM = Math.round(expectedPaddyVolumeTon * PROCESSING_FEE_PER_TON_RM);

  const partnerFromProfile = getOptionalString(ctx.farmProfile?.processingPartnerName, farmProfile.millerName);
  const suggestedPartner = partnerFromProfile ?? `${region} Rice Mill Partner`;
  const partnerLabel: ProcessingPlan["partnerLabel"] = partnerFromProfile ? "Farm profile partner" : "Suggested partner / demo";
  const processingBooked = ctx.farmProfile?.processingPartnerBooked === true;
  const processingStatus: ProcessingPlan["processingStatus"] = processingBooked ? "Booked" : "Not booked";

  const hasMarketPrice = market?.status === "available" && typeof market.paddyPricePerKgRM === "number";
  const marketIsLive = Boolean(hasMarketPrice && !isDemoMarket(market?.source));
  const marketLabel: DataSourceLabel = marketIsLive ? "Live Agent" : "Demo Mode";
  const marketPriceStatus: HarvestToMarketPlan["marketPriceStatus"] = marketIsLive
    ? "Live market"
    : hasMarketPrice
      ? "Estimated"
      : "Demo preview";
  const livePaddyPrice = hasMarketPrice ? market.paddyPricePerKgRM : null;
  const suggestedPricePerKgRM = round(livePaddyPrice ? Math.max(4.8, livePaddyPrice * 3.1) : 6.9, 2);
  const suggestedQuantityKg = Math.round(estimatedFinishedRiceKg * 0.35);
  const estimatedRevenueRM = Math.round(suggestedQuantityKg * suggestedPricePerKgRM);

  const mainHarvestStrategy = ctx.recommendation?.strategyName
    ? `${ctx.recommendation.strategyName} -> book milling service + prepare preorder draft`
    : "Book milling service + prepare preorder draft";

  const agentStatus = hasLiveYield
    ? "Live yield intelligence connected"
    : "Run agent cycle first to unlock live harvest planning";

  const heroMessage = hasLiveYield
    ? "Prepare for harvest-to-market planning after agent cycle."
    : "Run agent cycle first. Demo Preview remains available below.";

  const processingDate = processingBooked
    ? "Booked with processing partner"
    : "Farmer must confirm with miller";

  const fieldSummary = ctx.perception?.sensors?.hasAnySensorValue
    ? `Sensor-backed field summary available from ${ctx.perception.sensors.sourceKeys.join(", ") || "Firebase RTDB"}.`
    : "Demo preview field summary. Connect live sensor data for buyer-facing traceability.";

  const revenueLabel: PreorderDraft["revenueLabel"] = marketIsLive
    ? "Estimated from live market context"
    : hasMarketPrice
      ? "Estimated from market fallback"
      : "Estimated with Demo Mode pricing";

  const preorderWarning = "Farmer must confirm harvest and processing schedule before sharing.";

  const processingStatusText = processingBooked ? "booked" : "not booked";

  const assumptions: HarvestAssumption[] = [
    {
      label: "Yield",
      status: hasLiveYield ? "Live agent" : "Demo preview",
      detail: hasLiveYield
        ? `${round(yieldTonPerHa, 2)} t/ha from Yield Forecast Agent.`
        : "Run agent cycle first; demo yield is used only for preview.",
    },
    {
      label: "Field area",
      status: fieldArea ? "Live agent" : "Demo preview",
      detail: fieldArea ? `${round(fieldAreaHa, 2)} ha from farm profile.` : `${DEMO_FIELD_AREA_HA} ha demo field area.`,
    },
    {
      label: "Market price",
      status: marketPriceStatus,
      detail: livePaddyPrice
        ? `${currency} ${livePaddyPrice}/kg paddy reference from ${market?.source ?? "market context"}.`
        : "No live market price connected; price and revenue are estimates.",
    },
    {
      label: "Recovery rate",
      status: recoveryRateLabel,
      detail: `${recoveryRatePct}% rice recovery used for planning.`,
    },
    {
      label: "Processing partner",
      status: partnerFromProfile ? "Estimated" : "Demo preview",
      detail: `${partnerLabel}. ${processingBooked ? "Booking marked in farm profile." : "Farmer must confirm with miller."}`,
    },
    {
      label: "Preorder link",
      status: "Preview only",
      detail: "Public preorder preview is not published automatically.",
    },
  ];

  return {
    heroMessage,
    mainHarvestStrategy,
    agentStatus,
    marketLabel,
    marketPriceStatus,
    batch: {
      batchId,
      fieldName,
      region,
      country,
      currency,
      fieldAreaHa: round(fieldAreaHa, 2),
      fieldAreaSource,
      fieldAreaLabel,
      harvestWindow,
      expectedYieldTonPerHa: round(yieldTonPerHa, 2),
      expectedYieldLabel: hasLiveYield ? "Live yield estimate" : "Run agent cycle first",
      expectedPaddyVolumeTon,
      grainMoistureTarget: "20-25% before harvest",
      readinessStatus,
      confidence,
      dataSource: hasLiveYield ? "Live Agent" : "Demo Mode",
    },
    processingPlan: {
      dryingRequired: true,
      millingRequired: true,
      polishingRequired: true,
      packingRequired: true,
      suggestedPartner,
      partnerLabel,
      processingService: "Drying + milling + polishing + packing",
      estimatedProcessingFeeRM,
      recoveryRate,
      recoveryRatePct,
      recoveryRateLabel,
      estimatedFinishedRiceKg,
      processingStatus,
      note: "Raw paddy must be dried, milled, polished, graded, and packed before customer sale.",
      confirmationNote: processingBooked ? "Processing partner is marked booked in farm profile." : "Farmer must confirm with miller.",
    },
    strategies: [
      {
        id: "raw_paddy",
        label: "Sell raw paddy to miller/cooperative",
        effort: "Fastest",
        margin: "Lower margin",
        description: "Move harvest quickly through an existing buyer. This sells paddy as paddy, not table rice.",
        recommended: false,
      },
      {
        id: "processed_rice",
        label: "Book milling service, then sell processed rice",
        effort: "Medium effort",
        margin: "Better margin",
        description: "Pay a processing partner to convert paddy into packed rice before customer sale.",
        recommended: true,
      },
      {
        id: "preorder",
        label: "Open customer preorder for processed rice",
        effort: "Highest relationship value",
        margin: "Best direct relationship",
        description: "Collect interest only after harvest and processing dates are confirmed.",
        recommended: false,
      },
    ],
    preorderDraft: {
      status: "Draft",
      published: false,
      suggestedQuantityKg,
      suggestedPricePerKgRM,
      estimatedRevenueRM,
      revenueLabel,
      pickupDeliveryNote: "Pickup or local delivery window to be confirmed after milling and packing schedule.",
      publicLinkPreview: `smartpaddy.my/preorder/${batchId.toLowerCase()}`,
      publicLinkLabel: "Preview only",
      qrLabel: "QR preorder preview",
      whatsappInterestForm: `WhatsApp interest form: ${fieldName} processed rice batch`,
      warning: preorderWarning,
    },
    listingDraft: {
      title: `Traceable ${region} Rice Batch - SmartPaddy ${fieldName}`,
      shortDescription: `Rice batch planned from ${fieldName}, ${region}. Harvest window: ${harvestWindow}. Processing status: ${processingStatusText}. Traceability batch ${batchId}.`,
      whatsappSalesMessage: `Interest check: SmartPaddy is preparing traceability batch ${batchId} for ${fieldName}, ${region}. Harvest window: ${harvestWindow}. Processing is ${processingStatusText}; preorder sharing waits until drying, milling, polishing, grading, and packing dates are confirmed. Reply INTEREST to receive the public preview link when the farmer opens it.`,
      marketplaceDraft: `Product: Traceable ${region} Rice Batch - SmartPaddy ${fieldName}\n\nBatch ID: ${batchId}\nHarvest window: ${harvestWindow}\nProcessing status: ${processingStatusText}\n\nDescription: Planned processed rice batch from ${fieldName}, ${region}, ${country}. This listing draft is prepared from SmartPaddy field intelligence and remains unpublished until the farmer confirms harvest and processing schedules.\n\nProcessing: Raw paddy must be dried, milled, polished, graded, and packed by a processing partner before customer fulfillment.\n\nTraceability: Includes field batch ID, farm region, harvest window, processing status, and sensor-backed field summary when connected.\n\nNote: This is a preorder draft. No organic or freshness claims are made unless separately verified by the farmer and processing partner.`,
    },
    traceabilityRecord: {
      batchId,
      farmRegion: `${region}, ${country}`,
      harvestWindow,
      processingDate,
      processingStatus,
      fieldSummary,
      dataSource: hasLiveYield && ctx.perception?.sensors?.hasAnySensorValue ? "Live Agent" : "Demo Mode",
    },
    assumptions,
  };
}
