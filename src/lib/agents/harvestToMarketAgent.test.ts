import { describe, expect, it } from "vitest";
import { createEmptyFarmContext, type FarmContext, type YieldEstimate } from "./types";
import { createHarvestToMarketPlan } from "./harvestToMarketAgent";

const yieldEstimate: YieldEstimate = {
  basePrediction: 6.2,
  adjustedPrediction: 5.5,
  confidenceBand: { low: 4.9, mid: 5.5, high: 6.1 },
  adjustments: [],
  modelConfidence: 82,
};

function context(overrides: Partial<FarmContext> = {}): FarmContext {
  return {
    ...createEmptyFarmContext(),
    ...overrides,
  };
}

describe("createHarvestToMarketPlan", () => {
  it("calculates paddy volume from live yield and farm profile area", () => {
    const plan = createHarvestToMarketPlan(context({
      yieldEstimate,
      farmProfile: {
        fieldName: "Test Field",
        fieldAreaHa: 2.4,
        region: "Kedah",
      },
    }));

    expect(plan.batch.expectedYieldTonPerHa).toBe(5.5);
    expect(plan.batch.fieldAreaHa).toBe(2.4);
    expect(plan.batch.expectedPaddyVolumeTon).toBe(13.2);
    expect(plan.batch.dataSource).toBe("Live Agent");
    expect(plan.batch.fieldAreaLabel).toBe("Farm profile");
  });

  it("calculates finished rice from paddy volume and recovery rate", () => {
    const plan = createHarvestToMarketPlan(context({
      yieldEstimate,
      farmProfile: {
        fieldAreaHa: 2,
      },
    }));

    expect(plan.batch.expectedPaddyVolumeTon).toBe(11);
    expect(plan.processingPlan.recoveryRate).toBe(0.65);
    expect(plan.processingPlan.estimatedFinishedRiceKg).toBe(7150);
    expect(plan.processingPlan.recoveryRateLabel).toBe("Planning assumption");
  });

  it("labels demo fallback when yield estimate is missing", () => {
    const plan = createHarvestToMarketPlan(context());

    expect(plan.batch.dataSource).toBe("Demo Mode");
    expect(plan.batch.expectedYieldLabel).toBe("Run agent cycle first");
    expect(plan.heroMessage).toContain("Run agent cycle first");
    expect(plan.assumptions.find((item) => item.label === "Yield")?.status).toBe("Demo preview");
  });

  it("keeps preorder as draft and preview-only", () => {
    const plan = createHarvestToMarketPlan(context({ yieldEstimate }));

    expect(plan.preorderDraft.status).toBe("Draft");
    expect(plan.preorderDraft.published).toBe(false);
    expect(plan.preorderDraft.publicLinkLabel).toBe("Preview only");
    expect(plan.preorderDraft.warning).toContain("confirm harvest and processing schedule");
  });

  it("does not mark the processing partner as booked by default", () => {
    const plan = createHarvestToMarketPlan(context({
      yieldEstimate,
      farmProfile: {
        fieldAreaHa: 1.5,
      },
    }));

    expect(plan.processingPlan.processingStatus).toBe("Not booked");
    expect(plan.processingPlan.partnerLabel).toBe("Suggested partner / demo");
    expect(plan.processingPlan.confirmationNote).toContain("Farmer must confirm");
  });
});
