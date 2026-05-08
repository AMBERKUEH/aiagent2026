import { describe, expect, it } from "vitest";
import { generateScenarioTree } from "./scenarioEngine";
import type {
  AgentFinding,
  PerceptionResult,
  RiskProfile,
  UserGoal,
  YieldEstimate,
} from "./types";

const perception: PerceptionResult = {
  sensors: {
    humidity: 78,
    lightIntensity: 14200,
    soilMoisture: 70,
    temperature: 31,
    waterLevel: 2.1,
    timestamp: "2026-05-08T06:00:00.000Z",
    sourceKeys: ["test"],
    hasAnySensorValue: true,
  },
  weather: {
    rainfall_48h_mm: 62,
    rainfall_24h_mm: 28,
    rainfall_10d_mm: 120,
    temperature_max_c: 33,
    temperature_min_c: 25,
    humidity_pct: 80,
    wind_direction_deg: 220,
    wind_speed_kmh: 18,
    humidity_3day_avg: 79,
    no_rain_forecast_days: 0,
    data_age_hours: 0,
    source: "test-weather",
  },
  baseline: {
    avg_rainfall_mm: 145,
    avg_temperature_c: 32,
    period_years: 30,
    source: "test-baseline",
  },
  soil: [],
  ndvi: [],
  spi: [],
  monsoon: {
    front_days_away: 3,
    sw_wind_detected: true,
    humidity_3day_above_75: true,
    source: "test-monsoon",
  },
  weatherAlerts: [],
  market: {
    status: "available",
    fertilizers: [
      { name: "Urea", priceRM: 98, trend: "up", weeklyChangePct: 4.1 },
      { name: "NPK 15-15-15", priceRM: 116, trend: "stable", weeklyChangePct: 0.5 },
    ],
    paddyPricePerKgRM: 1.85,
    demandLevel: "moderate",
    source: "test-market",
  },
  diseases: [],
  timestamp: "2026-05-08T06:00:00.000Z",
};

const findings: AgentFinding[] = [
  {
    id: "weather-1",
    agentId: "weather-disaster",
    agentName: "Weather & Disaster",
    severity: "warning",
    finding: "MONSOON alert in North Zone: monsoon front 3 days away",
    detail: "Prepare drainage and delay fertilizer",
    confidence: 82,
    dataSources: ["test-weather"],
    timestamp: "2026-05-08T06:00:00.000Z",
    impactVector: {
      yieldImpact: -10,
      costImpactRM: 200,
      riskChange: 0.25,
      sustainabilityImpact: -5,
    },
  },
  {
    id: "market-1",
    agentId: "economic-intel",
    agentName: "Economic Intelligence",
    severity: "warning",
    finding: "Market sentiment: input costs rising",
    detail: "Fertilizer prices are rising",
    confidence: 70,
    dataSources: ["test-market"],
    timestamp: "2026-05-08T06:00:00.000Z",
    impactVector: {
      yieldImpact: 0,
      costImpactRM: 120,
      riskChange: 0.1,
      sustainabilityImpact: 0,
    },
  },
];

const riskProfile: RiskProfile = {
  overallRisk: 58,
  floodRisk: 70,
  droughtRisk: 12,
  diseaseRisk: 10,
  marketRisk: 35,
  riskTrend: "increasing",
};

const yieldEstimate: YieldEstimate = {
  basePrediction: 6.5,
  adjustedPrediction: 5.85,
  confidenceBand: { low: 5.1, mid: 5.85, high: 6.4 },
  adjustments: [],
  modelConfidence: 74,
};

function goal(type: UserGoal["type"], budgetRM = 5000): UserGoal {
  return {
    type,
    label: type,
    budgetRM,
    constraints: [],
  };
}

describe("generateScenarioTree", () => {
  it("generates multiple ranked scenarios with one recommendation", () => {
    const tree = generateScenarioTree(perception, findings, riskProfile, yieldEstimate, goal("balanced"));

    expect(tree.scenarios).toHaveLength(4);
    expect(tree.scenarios.filter((scenario) => scenario.isRecommended)).toHaveLength(1);
    expect(tree.scenarios[0].isRecommended).toBe(true);
    expect(tree.scenarios[0].reasoning.length).toBeGreaterThan(0);
  });

  it("changes the top strategy when the farmer changes goals", () => {
    const riskTree = generateScenarioTree(perception, findings, riskProfile, yieldEstimate, goal("minimize_risk"));
    const costTree = generateScenarioTree(perception, findings, riskProfile, yieldEstimate, goal("minimize_cost"));

    expect(riskTree.scenarios[0].strategyType).toBe("climate_safe");
    expect(costTree.scenarios[0].strategyType).toBe("cost_saving");
  });

  it("penalizes scenarios that exceed the farmer budget", () => {
    const tree = generateScenarioTree(perception, findings, riskProfile, yieldEstimate, goal("maximize_profit", 300));
    const aggressive = tree.scenarios.find((scenario) => scenario.strategyType === "aggressive_growth");

    expect(aggressive).toBeDefined();
    expect(aggressive?.projections.operationalCostRM).toBeGreaterThan(300);
    expect(aggressive?.goalAlignmentScore).toBeLessThan(75);
  });
});
