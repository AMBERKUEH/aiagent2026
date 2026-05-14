import type { AgentFinding, AgentId, FarmContext } from "./types";

export type WhatIfScenarioId =
  | "fertilize_today"
  | "delay_3_days"
  | "heavy_rain_tomorrow"
  | "reduce_irrigation"
  | "paddy_price_drop"
  | "possible_disease_risk";

export type DataSourceStatus = "Live Agent" | "Assumption" | "Missing" | "Demo Preview";
export type RecommendationStatus = "Recommended" | "Not recommended" | "Use with caution";

export interface WhatIfScenarioOption {
  id: WhatIfScenarioId;
  label: string;
  icon: string;
  description: string;
}

export interface WhatIfMetrics {
  expectedYieldTonPerHa: number;
  projectedProfitRM: number;
  overallRisk: number;
  washoutRisk: number;
  operationalCostRM: number;
  waterUsageLiters: number;
  confidence: number;
}

export interface WhatIfDataSource {
  label: string;
  status: DataSourceStatus;
  detail: string;
}

export interface WhatIfConclusion {
  status: RecommendationStatus;
  why: string;
  tradeoff: string;
  nextAction: string;
}

export interface WhatIfAgentInfluence {
  agentId: AgentId | "safety";
  agentName: string;
  contribution: string;
  status: DataSourceStatus;
}

export interface WhatIfSimulationResult {
  scenarioId: WhatIfScenarioId;
  scenarioLabel: string;
  current: WhatIfMetrics;
  alternative: WhatIfMetrics;
  conclusion: WhatIfConclusion;
  agentInfluence: WhatIfAgentInfluence[];
  dataSources: WhatIfDataSource[];
  safetyNote: string;
}

export interface WhatIfLockedState {
  locked: true;
  missingRequirements: string[];
  message: string;
  demoPreviewAvailable: true;
}

export interface WhatIfReadyState {
  locked: false;
  fieldName: string;
  region: string;
  fieldAreaHa: number;
  fieldAreaSource: DataSourceStatus;
  currentPlanName: string;
  basePriceRMPerKg: number;
  baseCostSource: DataSourceStatus;
  scenarioOptions: WhatIfScenarioOption[];
  selected: WhatIfSimulationResult;
}

export type WhatIfSimulatorState = WhatIfLockedState | WhatIfReadyState;

export const WHAT_IF_SCENARIOS: WhatIfScenarioOption[] = [
  {
    id: "fertilize_today",
    label: "Fertilize Today",
    icon: "compost",
    description: "Test applying fertilizer immediately against rain and soil conditions.",
  },
  {
    id: "delay_3_days",
    label: "Delay 3 Days",
    icon: "schedule",
    description: "Test waiting before fertilizer or field action.",
  },
  {
    id: "heavy_rain_tomorrow",
    label: "Heavy Rain Tomorrow",
    icon: "rainy",
    description: "Stress-test the plan against a wet-weather shock.",
  },
  {
    id: "reduce_irrigation",
    label: "Reduce Irrigation",
    icon: "water_drop",
    description: "Test cutting water input based on current moisture.",
  },
  {
    id: "paddy_price_drop",
    label: "Paddy Price Drop",
    icon: "trending_down",
    description: "Recalculate profit if paddy price falls by 10%.",
  },
  {
    id: "possible_disease_risk",
    label: "Possible Disease Risk",
    icon: "coronavirus",
    description: "Test yield and confidence under a disease-risk signal.",
  },
];

const SAFETY_NOTE = "This is a planning simulation, not a guaranteed outcome. Verify field conditions before action.";
const DEFAULT_FIELD_AREA_HA = 1.2;
const DEFAULT_BASE_COST_RM = 900;
const DEFAULT_WATER_USAGE_LITERS = 8000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const getFieldAreaHa = (ctx: FarmContext) => {
  const value = ctx.farmProfile?.fieldAreaHa;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? { value, source: "Live Agent" as const }
    : { value: DEFAULT_FIELD_AREA_HA, source: "Assumption" as const };
};

const getFieldName = (ctx: FarmContext) => ctx.farmProfile?.fieldName ?? "Paddy Field 3A";
const getRegion = (ctx: FarmContext) =>
  ctx.regionContext?.region ?? ctx.regionContext?.state ?? ctx.farmProfile?.region ?? "Kedah, Malaysia";

const getRecommendedScenario = (ctx: FarmContext) =>
  ctx.scenarioTree?.scenarios.find((scenario) => scenario.isRecommended) ?? ctx.scenarioTree?.scenarios[0] ?? null;

const deriveBaseCost = (ctx: FarmContext) => {
  const scenario = getRecommendedScenario(ctx);
  if (scenario) {
    return {
      value: scenario.projections.operationalCostRM,
      source: "Live Agent" as DataSourceStatus,
      detail: "From current recommended scenario.",
    };
  }

  return {
    value: DEFAULT_BASE_COST_RM,
    source: "Assumption" as DataSourceStatus,
    detail: "Scenario cost unavailable; using planning assumption.",
  };
};

const deriveBaseWaterUsage = (ctx: FarmContext) => {
  const scenario = getRecommendedScenario(ctx);
  if (scenario) return scenario.projections.waterUsageLiters;
  return DEFAULT_WATER_USAGE_LITERS;
};

const deriveWashoutRisk = (soilMoisture: number, rainfall48h: number, waterLevel: number | null) => {
  const soilComponent = soilMoisture >= 85 ? 40 : soilMoisture >= 75 ? 28 : soilMoisture >= 60 ? 14 : 6;
  const rainComponent = rainfall48h >= 80 ? 42 : rainfall48h >= 50 ? 30 : rainfall48h >= 25 ? 16 : 5;
  const waterComponent = waterLevel !== null && waterLevel >= 3.5 ? 15 : waterLevel !== null && waterLevel >= 2.5 ? 8 : 0;
  return clamp(Math.round(soilComponent + rainComponent + waterComponent), 0, 100);
};

const getConfidence = (ctx: FarmContext, baseConfidence: number) => {
  const safetyWarnings = ctx.safetyFindings.filter((finding) => finding.severity === "warning" || finding.severity === "critical").length;
  const criticalFindings = ctx.findings.filter((finding) => finding.severity === "critical").length;
  return clamp(baseConfidence - safetyWarnings * 8 - criticalFindings * 4, 20, 95);
};

const profit = (yieldTonPerHa: number, fieldAreaHa: number, priceRMPerKg: number, costRM: number) =>
  Math.round(yieldTonPerHa * fieldAreaHa * 1000 * priceRMPerKg - costRM);

const addAgentInfluence = (ctx: FarmContext, scenarioId: WhatIfScenarioId): WhatIfAgentInfluence[] => {
  const hasFinding = (agentId: AgentId) => ctx.findings.some((finding) => finding.agentId === agentId);
  const influences: WhatIfAgentInfluence[] = [
    {
      agentId: "field-monitor",
      agentName: "Field Monitor Agent",
      contribution: "Supplies soil moisture, water level, and sensor context for risk changes.",
      status: hasFinding("field-monitor") || ctx.perception?.sensors ? "Live Agent" : "Missing",
    },
    {
      agentId: "weather-disaster",
      agentName: "Weather Agent",
      contribution: "Supplies rainfall and flood/washout pressure.",
      status: hasFinding("weather-disaster") || ctx.perception?.weather ? "Live Agent" : "Missing",
    },
    {
      agentId: "yield-forecast",
      agentName: "Yield Forecast Agent",
      contribution: "Provides base yield and model confidence.",
      status: ctx.yieldEstimate ? "Live Agent" : "Missing",
    },
    {
      agentId: "economic-intel",
      agentName: "Market & Cost Agent",
      contribution: scenarioId === "paddy_price_drop" ? "Reprices revenue under market shock." : "Provides paddy price context.",
      status: ctx.perception?.market?.paddyPricePerKgRM !== null && ctx.perception?.market?.paddyPricePerKgRM !== undefined ? "Live Agent" : "Missing",
    },
    {
      agentId: "safety",
      agentName: "Safety Agent",
      contribution: ctx.safetyFindings.length > 0 ? "Adjusts confidence for warnings." : "No separate safety findings connected.",
      status: ctx.safetyFindings.length > 0 ? "Live Agent" : "Assumption",
    },
    {
      agentId: "synthesizer",
      agentName: "Synthesizer Agent",
      contribution: ctx.recommendation ? `Current plan: ${ctx.recommendation.strategyName}.` : "No synthesized recommendation yet.",
      status: ctx.recommendation ? "Live Agent" : "Missing",
    },
  ];

  return influences;
};

const missingRequirements = (ctx: FarmContext) => {
  const missing: string[] = [];
  if (!ctx.yieldEstimate) missing.push("Yield forecast missing");
  if (!ctx.riskProfile) missing.push("Risk profile missing");
  if (ctx.perception?.market?.paddyPricePerKgRM === null || ctx.perception?.market?.paddyPricePerKgRM === undefined) {
    missing.push("Market price missing");
  }
  if (!ctx.perception?.sensors || !ctx.perception.sensors.hasAnySensorValue) missing.push("Sensor context missing");
  return missing;
};

export function createWhatIfSimulatorState(
  ctx: FarmContext,
  scenarioId: WhatIfScenarioId = "fertilize_today",
): WhatIfSimulatorState {
  const missing = missingRequirements(ctx);
  if (missing.length > 0) {
    return {
      locked: true,
      missingRequirements: missing,
      message: "Run AI Agent Cycle first to unlock live simulation.",
      demoPreviewAvailable: true,
    };
  }

  const selectedOption = WHAT_IF_SCENARIOS.find((scenario) => scenario.id === scenarioId) ?? WHAT_IF_SCENARIOS[0];
  const fieldArea = getFieldAreaHa(ctx);
  const baseCost = deriveBaseCost(ctx);
  const baseWaterUsage = deriveBaseWaterUsage(ctx);
  const sensors = ctx.perception!.sensors;
  const weather = ctx.perception!.weather;
  const price = ctx.perception!.market.paddyPricePerKgRM!;
  const baseYield = ctx.yieldEstimate!.adjustedPrediction;
  const baseRisk = ctx.riskProfile!.overallRisk;
  const soilMoisture = sensors.soilMoisture ?? 60;
  const rainfall48h = weather.rainfall_48h_mm;
  const rainfall24h = weather.rainfall_24h_mm;
  const baseWashoutRisk = deriveWashoutRisk(soilMoisture, rainfall48h, sensors.waterLevel);
  const baseConfidence = getConfidence(ctx, ctx.yieldEstimate!.modelConfidence);

  const current: WhatIfMetrics = {
    expectedYieldTonPerHa: round(baseYield, 2),
    projectedProfitRM: profit(baseYield, fieldArea.value, price, baseCost.value),
    overallRisk: Math.round(baseRisk),
    washoutRisk: baseWashoutRisk,
    operationalCostRM: Math.round(baseCost.value),
    waterUsageLiters: Math.round(baseWaterUsage),
    confidence: Math.round(baseConfidence),
  };

  const alternative = { ...current };
  let conclusion: WhatIfConclusion = {
    status: "Use with caution",
    why: "Alternative action changes the live farm risk profile.",
    tradeoff: "Review the comparison before acting.",
    nextAction: "Verify field conditions before making changes.",
  };

  const wetOrRainy = soilMoisture >= 80 || rainfall48h >= 50;

  switch (selectedOption.id) {
    case "fertilize_today": {
      const extraCost = 320;
      if (wetOrRainy) {
        alternative.washoutRisk = clamp(current.washoutRisk + 30, 0, 100);
        alternative.overallRisk = clamp(current.overallRisk + 18, 0, 100);
        alternative.operationalCostRM = current.operationalCostRM + extraCost;
        alternative.expectedYieldTonPerHa = round(current.expectedYieldTonPerHa * 0.98, 2);
        alternative.projectedProfitRM = profit(alternative.expectedYieldTonPerHa, fieldArea.value, price, alternative.operationalCostRM) - 180;
        alternative.confidence = clamp(current.confidence - 8, 0, 100);
        conclusion = {
          status: "Not recommended",
          why: `Soil moisture is ${soilMoisture}% and 48h rainfall is ${rainfall48h}mm, so fertilizer washout risk rises sharply.`,
          tradeoff: "Immediate nutrient application may be lost to runoff, adding cost without reliable yield gain.",
          nextAction: "Delay fertilizer and check drainage or bunding first.",
        };
      } else {
        alternative.washoutRisk = clamp(current.washoutRisk + 6, 0, 100);
        alternative.overallRisk = clamp(current.overallRisk + 4, 0, 100);
        alternative.operationalCostRM = current.operationalCostRM + extraCost;
        alternative.expectedYieldTonPerHa = round(current.expectedYieldTonPerHa * 1.03, 2);
        alternative.projectedProfitRM = profit(alternative.expectedYieldTonPerHa, fieldArea.value, price, alternative.operationalCostRM);
        conclusion = {
          status: alternative.overallRisk > 60 ? "Use with caution" : "Recommended",
          why: "Current moisture and rain risk do not indicate a strong washout signal.",
          tradeoff: "You accept higher input cost for a modest yield lift.",
          nextAction: "Apply only if field inspection confirms stable water conditions.",
        };
      }
      break;
    }
    case "delay_3_days": {
      if (wetOrRainy) {
        alternative.washoutRisk = clamp(current.washoutRisk - 22, 0, 100);
        alternative.overallRisk = clamp(current.overallRisk - 8, 0, 100);
        alternative.expectedYieldTonPerHa = round(current.expectedYieldTonPerHa * 0.995, 2);
        alternative.operationalCostRM = current.operationalCostRM;
        alternative.projectedProfitRM = profit(alternative.expectedYieldTonPerHa, fieldArea.value, price, alternative.operationalCostRM) + 80;
        alternative.confidence = clamp(current.confidence + 3, 0, 100);
        conclusion = {
          status: "Recommended",
          why: "Wet or rainy conditions make delay a safer option for avoiding nutrient washout.",
          tradeoff: "Yield impact is near neutral, while profit stability improves by avoiding wasted inputs.",
          nextAction: "Recheck rainfall and field moisture in 72 hours.",
        };
      } else {
        alternative.washoutRisk = clamp(current.washoutRisk - 4, 0, 100);
        alternative.overallRisk = clamp(current.overallRisk + (soilMoisture < 45 && rainfall48h < 10 ? 8 : 1), 0, 100);
        alternative.expectedYieldTonPerHa = round(current.expectedYieldTonPerHa * (soilMoisture < 45 && rainfall48h < 10 ? 0.97 : 0.99), 2);
        alternative.projectedProfitRM = profit(alternative.expectedYieldTonPerHa, fieldArea.value, price, current.operationalCostRM);
        conclusion = {
          status: soilMoisture < 45 && rainfall48h < 10 ? "Use with caution" : "Recommended",
          why: soilMoisture < 45 && rainfall48h < 10 ? "Dry soil and low rain forecast may increase nutrient stress if action is delayed." : "No major rain washout pressure is present.",
          tradeoff: "Delay lowers operational urgency but may postpone crop response.",
          nextAction: "Scout crop color and soil moisture before waiting.",
        };
      }
      break;
    }
    case "heavy_rain_tomorrow": {
      alternative.washoutRisk = clamp(current.washoutRisk + 35, 0, 100);
      alternative.overallRisk = clamp(current.overallRisk + 20, 0, 100);
      alternative.expectedYieldTonPerHa = round(current.expectedYieldTonPerHa * 0.96, 2);
      alternative.projectedProfitRM = profit(alternative.expectedYieldTonPerHa, fieldArea.value, price, current.operationalCostRM + 120);
      alternative.confidence = clamp(current.confidence - 12, 0, 100);
      conclusion = {
        status: "Use with caution",
        why: `A heavy-rain shock raises flood and washout risk from the current ${rainfall24h}mm 24h rainfall baseline.`,
        tradeoff: "Defensive drainage work may add cost but protects yield and inputs.",
        nextAction: "Inspect drainage outlets and bunds before applying inputs.",
      };
      break;
    }
    case "reduce_irrigation": {
      if (soilMoisture >= 75) {
        alternative.waterUsageLiters = Math.round(current.waterUsageLiters * 0.75);
        alternative.operationalCostRM = Math.max(0, current.operationalCostRM - 90);
        alternative.overallRisk = clamp(current.overallRisk - 6, 0, 100);
        alternative.washoutRisk = clamp(current.washoutRisk - 8, 0, 100);
        alternative.projectedProfitRM = profit(current.expectedYieldTonPerHa, fieldArea.value, price, alternative.operationalCostRM);
        conclusion = {
          status: "Recommended",
          why: `Soil moisture is ${soilMoisture}%, so reducing irrigation can cut cost and water use without adding drought pressure.`,
          tradeoff: "Savings are useful, but fields still need monitoring if weather changes.",
          nextAction: "Reduce irrigation temporarily and recheck soil moisture.",
        };
      } else {
        alternative.waterUsageLiters = Math.round(current.waterUsageLiters * 0.7);
        alternative.overallRisk = clamp(current.overallRisk + 14, 0, 100);
        alternative.expectedYieldTonPerHa = round(current.expectedYieldTonPerHa * 0.95, 2);
        alternative.projectedProfitRM = profit(alternative.expectedYieldTonPerHa, fieldArea.value, price, Math.max(0, current.operationalCostRM - 70));
        alternative.confidence = clamp(current.confidence - 5, 0, 100);
        conclusion = {
          status: "Not recommended",
          why: `Soil moisture is ${soilMoisture}%, so reducing irrigation increases drought stress risk.`,
          tradeoff: "Lower water cost may be outweighed by yield loss.",
          nextAction: "Maintain irrigation until moisture recovers.",
        };
      }
      break;
    }
    case "paddy_price_drop": {
      const newPrice = price * 0.9;
      alternative.projectedProfitRM = profit(current.expectedYieldTonPerHa, fieldArea.value, newPrice, current.operationalCostRM);
      alternative.confidence = clamp(current.confidence - 2, 0, 100);
      conclusion = {
        status: "Use with caution",
        why: `A 10% price drop lowers paddy reference price from RM ${price.toFixed(2)}/kg to RM ${newPrice.toFixed(2)}/kg.`,
        tradeoff: "Yield stays the same, but revenue and profit fall immediately.",
        nextAction: "Ask Market & Cost Agent to monitor selling windows before committing.",
      };
      break;
    }
    case "possible_disease_risk": {
      const diseaseFindings = ctx.findings.filter((finding) => finding.agentId === "crop-health");
      const lowConfidenceDisease = diseaseFindings.some((finding) => finding.confidence < 70);
      alternative.overallRisk = clamp(current.overallRisk + 10, 0, 100);
      alternative.expectedYieldTonPerHa = round(current.expectedYieldTonPerHa * 0.96, 2);
      alternative.projectedProfitRM = profit(alternative.expectedYieldTonPerHa, fieldArea.value, price, current.operationalCostRM + 120);
      alternative.confidence = clamp(current.confidence - (lowConfidenceDisease || diseaseFindings.length === 0 ? 12 : 6), 0, 100);
      conclusion = {
        status: "Use with caution",
        why: lowConfidenceDisease || diseaseFindings.length === 0 ? "Disease confidence is missing or uncertain, so the simulation treats this as a scouting risk." : "Crop Health Agent findings suggest disease pressure could reduce yield.",
        tradeoff: "Preventive scouting adds effort and possible cost, but may avoid larger yield loss.",
        nextAction: "Retake crop scan and scout affected zones before treatment.",
      };
      break;
    }
  }

  alternative.expectedYieldTonPerHa = round(alternative.expectedYieldTonPerHa, 2);
  alternative.projectedProfitRM = Math.round(alternative.projectedProfitRM);
  alternative.overallRisk = Math.round(alternative.overallRisk);
  alternative.washoutRisk = Math.round(alternative.washoutRisk);
  alternative.operationalCostRM = Math.round(alternative.operationalCostRM);
  alternative.waterUsageLiters = Math.round(alternative.waterUsageLiters);
  alternative.confidence = Math.round(alternative.confidence);

  const dataSources: WhatIfDataSource[] = [
    { label: "Yield forecast", status: "Live Agent", detail: `${current.expectedYieldTonPerHa} t/ha adjusted yield.` },
    { label: "Risk profile", status: "Live Agent", detail: `${current.overallRisk}% overall risk from multi-agent analysis.` },
    { label: "Market price", status: "Live Agent", detail: `RM ${price.toFixed(2)}/kg paddy reference.` },
    { label: "Sensor context", status: "Live Agent", detail: `Soil ${soilMoisture}%, rainfall 48h ${rainfall48h}mm.` },
    { label: "Field area", status: fieldArea.source, detail: `${fieldArea.value} ha used for profit calculation.` },
    { label: "Operational cost", status: baseCost.source, detail: baseCost.detail },
  ];

  return {
    locked: false,
    fieldName: getFieldName(ctx),
    region: getRegion(ctx),
    fieldAreaHa: fieldArea.value,
    fieldAreaSource: fieldArea.source,
    currentPlanName: ctx.recommendation?.strategyName ?? "Current SmartPaddy plan",
    basePriceRMPerKg: price,
    baseCostSource: baseCost.source,
    scenarioOptions: WHAT_IF_SCENARIOS,
    selected: {
      scenarioId: selectedOption.id,
      scenarioLabel: selectedOption.label,
      current,
      alternative,
      conclusion,
      agentInfluence: addAgentInfluence(ctx, selectedOption.id),
      dataSources,
      safetyNote: SAFETY_NOTE,
    },
  };
}
