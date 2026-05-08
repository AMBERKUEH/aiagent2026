// ============================================================
// Yield Forecast Agent
// ============================================================
// Wraps the XGBoost backend prediction with uncertainty bands
// and cross-agent adjustments. Produces adjusted yield estimates
// that account for weather, disease, and market conditions.
// ============================================================

import type { NormalizedSensors } from "@/lib/sensors";
import type { AgentFinding, YieldEstimate } from "./types";

let findingCounter = 0;
function nextId(): string {
  return `yf-${++findingCounter}-${Date.now()}`;
}

async function fetchBackendPrediction(sensors: NormalizedSensors): Promise<{
  prediction: number;
  confidence: number;
  test_r2: number;
} | null> {
  if (
    sensors.humidity === null ||
    sensors.lightIntensity === null ||
    sensors.soilMoisture === null ||
    sensors.temperature === null ||
    sensors.waterLevel === null
  ) {
    return null;
  }

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        humidity: sensors.humidity,
        light_intensity: sensors.lightIntensity,
        soil_moisture: sensors.soilMoisture,
        temperature: sensors.temperature,
        water_level: sensors.waterLevel,
      }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Heuristic fallback when backend is unavailable
function heuristicYield(sensors: NormalizedSensors): number {
  let base = 5.5; // Malaysia average paddy yield t/ha
  if (sensors.soilMoisture !== null) {
    if (sensors.soilMoisture >= 65 && sensors.soilMoisture <= 80) base += 0.8;
    else if (sensors.soilMoisture < 45) base -= 1.2;
    else if (sensors.soilMoisture > 88) base -= 0.5;
  }
  if (sensors.temperature !== null) {
    if (sensors.temperature <= 33) base += 0.4;
    else if (sensors.temperature > 35) base -= 0.8;
  }
  return Math.max(2, Math.min(9, base));
}

export async function runYieldForecastAgent(
  sensors: NormalizedSensors,
  otherFindings: AgentFinding[],
): Promise<{ findings: AgentFinding[]; estimate: YieldEstimate }> {
  const ts = new Date().toISOString();
  const base = {
    agentId: "yield-forecast" as const,
    agentName: "Yield Forecast",
    timestamp: ts,
    dataSources: ["XGBoost Model", "ESP32 Sensors"],
  };

  const backendResult = await fetchBackendPrediction(sensors);
  const rawPrediction = backendResult?.prediction ?? heuristicYield(sensors);
  const modelConfidence = backendResult?.confidence ?? 55;

  // Apply cross-agent adjustments
  const adjustments: YieldEstimate["adjustments"] = [];
  let adjustedPrediction = rawPrediction;

  for (const f of otherFindings) {
    if (f.impactVector.yieldImpact !== 0 && Math.abs(f.impactVector.yieldImpact) >= 5) {
      const delta = (f.impactVector.yieldImpact / 100) * rawPrediction;
      adjustments.push({
        source: f.agentId,
        reason: f.finding,
        delta: Math.round(delta * 100) / 100,
      });
      adjustedPrediction += delta;
    }
  }

  adjustedPrediction = Math.max(1.5, Math.min(10, adjustedPrediction));

  // Confidence bands (wider when adjustments are large)
  const totalAdjustment = Math.abs(adjustedPrediction - rawPrediction);
  const bandWidth = 0.6 + totalAdjustment * 0.3;
  const estimate: YieldEstimate = {
    basePrediction: Math.round(rawPrediction * 100) / 100,
    adjustedPrediction: Math.round(adjustedPrediction * 100) / 100,
    confidenceBand: {
      low: Math.round((adjustedPrediction - bandWidth) * 100) / 100,
      mid: Math.round(adjustedPrediction * 100) / 100,
      high: Math.round((adjustedPrediction + bandWidth * 0.7) * 100) / 100,
    },
    adjustments,
    modelConfidence,
  };

  // Generate finding
  const findings: AgentFinding[] = [];
  const riskLabel = adjustedPrediction >= 6.5 ? "positive" : adjustedPrediction >= 5 ? "info" : "warning";

  findings.push({
    ...base,
    id: nextId(),
    severity: riskLabel === "positive" ? "positive" : riskLabel === "info" ? "info" : "warning",
    finding: `Yield projection: ${estimate.adjustedPrediction} t/ha (${estimate.confidenceBand.low}–${estimate.confidenceBand.high})`,
    detail: `Base model prediction: ${estimate.basePrediction} t/ha. ${
      adjustments.length > 0
        ? `Adjusted by ${adjustments.length} agent findings (net ${adjustments.reduce((s, a) => s + a.delta, 0) > 0 ? "+" : ""}${adjustments.reduce((s, a) => s + a.delta, 0).toFixed(2)} t/ha).`
        : "No cross-agent adjustments applied."
    } Model confidence: ${modelConfidence}%.`,
    confidence: modelConfidence,
    impactVector: {
      yieldImpact: 0,
      costImpactRM: 0,
      riskChange: adjustedPrediction < 5 ? 0.2 : -0.1,
      sustainabilityImpact: 0,
    },
  });

  return { findings, estimate };
}
