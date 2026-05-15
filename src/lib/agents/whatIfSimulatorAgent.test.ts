import { describe, expect, it } from "vitest";
import { createEmptyFarmContext, type FarmContext, type PerceptionResult, type RiskProfile, type YieldEstimate } from "./types";
import { createWhatIfSimulatorState } from "./whatIfSimulatorAgent";

const yieldEstimate: YieldEstimate = {
  basePrediction: 6,
  adjustedPrediction: 5.5,
  confidenceBand: { low: 5, mid: 5.5, high: 6 },
  adjustments: [],
  modelConfidence: 82,
};

const riskProfile: RiskProfile = {
  overallRisk: 40,
  floodRisk: 35,
  droughtRisk: 20,
  diseaseRisk: 18,
  marketRisk: 12,
  riskTrend: "stable",
};

function perception(overrides: Partial<PerceptionResult> = {}): PerceptionResult {
  return {
    sensors: {
      humidity: 78,
      lightIntensity: 12000,
      soilMoisture: 82,
      temperature: 31,
      waterLevel: 2.5,
      timestamp: "2026-05-08T06:00:00.000Z",
      sourceKeys: ["test"],
      hasAnySensorValue: true,
    },
    weather: {
      rainfall_48h_mm: 60,
      rainfall_24h_mm: 25,
      rainfall_10d_mm: 100,
      temperature_max_c: 33,
      temperature_min_c: 25,
      humidity_pct: 80,
      wind_direction_deg: 220,
      wind_speed_kmh: 18,
      humidity_3day_avg: 78,
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
      fertilizers: [],
      paddyPricePerKgRM: 2,
      demandLevel: "moderate",
      source: "test-market",
    },
    diseases: [],
    timestamp: "2026-05-08T06:00:00.000Z",
    ...overrides,
  };
}

function context(overrides: Partial<FarmContext> = {}): FarmContext {
  return {
    ...createEmptyFarmContext(),
    yieldEstimate,
    riskProfile,
    perception: perception(),
    farmProfile: { fieldAreaHa: 2 },
    ...overrides,
  };
}

describe("createWhatIfSimulatorState", () => {
  it("uses live yieldEstimate to build the base plan", () => {
    const state = createWhatIfSimulatorState(context(), "fertilize_today");

    expect(state.locked).toBe(false);
    if (!state.locked) {
      expect(state.selected.current.expectedYieldTonPerHa).toBe(5.5);
      expect(state.selected.current.projectedProfitRM).toBe(21100);
    }
  });

  it("Fertilize Today increases washout risk when soil moisture or rainfall are high", () => {
    const state = createWhatIfSimulatorState(context(), "fertilize_today");

    expect(state.locked).toBe(false);
    if (!state.locked) {
      expect(state.selected.alternative.washoutRisk).toBeGreaterThan(state.selected.current.washoutRisk);
      expect(state.selected.conclusion.status).toBe("Not recommended");
    }
  });

  it("Delay 3 Days lowers washout risk under wet/rainy conditions", () => {
    const state = createWhatIfSimulatorState(context(), "delay_3_days");

    expect(state.locked).toBe(false);
    if (!state.locked) {
      expect(state.selected.alternative.washoutRisk).toBeLessThan(state.selected.current.washoutRisk);
      expect(state.selected.conclusion.status).toBe("Recommended");
    }
  });

  it("Paddy Price Drop recalculates lower profit from live market price", () => {
    const state = createWhatIfSimulatorState(context(), "paddy_price_drop");

    expect(state.locked).toBe(false);
    if (!state.locked) {
      expect(state.selected.alternative.projectedProfitRM).toBeLessThan(state.selected.current.projectedProfitRM);
      expect(state.selected.conclusion.why).toContain("10% price drop");
    }
  });

  it("uses a clearly marked demo market price instead of locking when market price is missing", () => {
    const state = createWhatIfSimulatorState(context({
      perception: perception({
        market: {
          status: "unavailable",
          fertilizers: [],
          paddyPricePerKgRM: null,
          demandLevel: null,
          source: "test-market",
        },
      }),
    }), "paddy_price_drop");

    expect(state.locked).toBe(false);
    if (!state.locked) {
      expect(state.basePriceRMPerKg).toBe(1.35);
      expect(state.selected.dataSources.find((source) => source.label === "Market price")?.status).toBe("Demo Preview");
      expect(state.selected.agentInfluence.find((agent) => agent.agentId === "economic-intel")?.status).toBe("Demo Preview");
    }
  });

  it("Reduce Irrigation is positive when soil moisture is high and risky when low", () => {
    const wetState = createWhatIfSimulatorState(context(), "reduce_irrigation");
    const dryState = createWhatIfSimulatorState(context({
      perception: perception({
        sensors: {
          ...perception().sensors,
          soilMoisture: 35,
        },
        weather: {
          ...perception().weather,
          rainfall_48h_mm: 2,
        },
      }),
    }), "reduce_irrigation");

    expect(wetState.locked).toBe(false);
    expect(dryState.locked).toBe(false);
    if (!wetState.locked && !dryState.locked) {
      expect(wetState.selected.conclusion.status).toBe("Recommended");
      expect(dryState.selected.conclusion.status).toBe("Not recommended");
      expect(dryState.selected.alternative.expectedYieldTonPerHa).toBeLessThan(dryState.selected.current.expectedYieldTonPerHa);
    }
  });

  it("missing yieldEstimate returns locked state, not fake real output", () => {
    const state = createWhatIfSimulatorState(context({ yieldEstimate: null }), "fertilize_today");

    expect(state.locked).toBe(true);
    if (state.locked) {
      expect(state.missingRequirements).toContain("Yield forecast missing");
      expect(state.message).toContain("Run AI Agent Cycle first");
    }
  });

  it("does not mutate original FarmContext", () => {
    const farmCtx = context();
    const before = JSON.stringify(farmCtx);

    createWhatIfSimulatorState(farmCtx, "heavy_rain_tomorrow");

    expect(JSON.stringify(farmCtx)).toBe(before);
  });
});
