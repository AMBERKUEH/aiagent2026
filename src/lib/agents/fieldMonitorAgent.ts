// ============================================================
// Field Monitor Agent
// ============================================================
// Analyzes live IoT sensor data for anomalies, threshold
// violations, and trend-based warnings. Produces findings
// that feed into the Orchestrator.
// ============================================================

import type { NormalizedSensors } from "@/lib/sensors";
import type { AgentFinding, ImpactVector } from "./types";

let findingCounter = 0;
function nextFindingId(): string {
  return `fm-${++findingCounter}-${Date.now()}`;
}

const ZERO_IMPACT: ImpactVector = {
  yieldImpact: 0,
  costImpactRM: 0,
  riskChange: 0,
  sustainabilityImpact: 0,
};

// ── Thresholds (calibrated for Malaysian paddy) ─────────────
const THRESHOLDS = {
  soilMoisture: { critical_low: 30, warning_low: 45, optimal_low: 65, optimal_high: 80, warning_high: 88, critical_high: 95 },
  temperature:  { optimal_max: 33, warning_max: 35, critical_max: 38 },
  humidity:     { fungal_risk: 85, severe_fungal: 92, too_low: 40 },
  waterLevel:   { critical_low: 0.5, warning_low: 1.0, optimal: 2.0, flood_warning: 3.5 },
  lightIntensity: { low: 5000, adequate: 10000 },
} as const;

export function runFieldMonitorAgent(sensors: NormalizedSensors): AgentFinding[] {
  const findings: AgentFinding[] = [];
  const ts = new Date().toISOString();
  const base = { agentId: "field-monitor" as const, agentName: "Field Monitor", timestamp: ts, dataSources: ["ESP32 IoT Sensors", "Firebase RTDB"] };

  // ── Soil Moisture Analysis ────────────────────────────────
  if (sensors.soilMoisture !== null) {
    const sm = sensors.soilMoisture;

    if (sm < THRESHOLDS.soilMoisture.critical_low) {
      findings.push({
        ...base, id: nextFindingId(), severity: "critical",
        finding: `Critical soil moisture: ${sm}%`,
        detail: `Soil moisture at ${sm}% is critically below the ${THRESHOLDS.soilMoisture.critical_low}% threshold. Immediate irrigation required to prevent crop loss.`,
        confidence: 92,
        impactVector: { yieldImpact: -25, costImpactRM: 200, riskChange: 0.4, sustainabilityImpact: -15 },
      });
    } else if (sm < THRESHOLDS.soilMoisture.warning_low) {
      findings.push({
        ...base, id: nextFindingId(), severity: "warning",
        finding: `Low soil moisture: ${sm}%`,
        detail: `Soil moisture at ${sm}% is below the optimal range (${THRESHOLDS.soilMoisture.optimal_low}-${THRESHOLDS.soilMoisture.optimal_high}%). Schedule irrigation within 24 hours.`,
        confidence: 88,
        impactVector: { yieldImpact: -10, costImpactRM: 100, riskChange: 0.2, sustainabilityImpact: -5 },
      });
    } else if (sm > THRESHOLDS.soilMoisture.critical_high) {
      findings.push({
        ...base, id: nextFindingId(), severity: "critical",
        finding: `Waterlogged soil: ${sm}%`,
        detail: `Soil moisture at ${sm}% indicates waterlogging. Root rot risk is high. Drainage is urgent.`,
        confidence: 90,
        impactVector: { yieldImpact: -20, costImpactRM: 150, riskChange: 0.35, sustainabilityImpact: -10 },
      });
    } else if (sm > THRESHOLDS.soilMoisture.warning_high) {
      findings.push({
        ...base, id: nextFindingId(), severity: "warning",
        finding: `Saturated soil: ${sm}%`,
        detail: `Soil moisture at ${sm}% is above optimal. Monitor drainage and hold irrigation.`,
        confidence: 85,
        impactVector: { yieldImpact: -5, costImpactRM: 50, riskChange: 0.15, sustainabilityImpact: -3 },
      });
    } else if (sm >= THRESHOLDS.soilMoisture.optimal_low && sm <= THRESHOLDS.soilMoisture.optimal_high) {
      findings.push({
        ...base, id: nextFindingId(), severity: "positive",
        finding: `Optimal soil moisture: ${sm}%`,
        detail: `Soil moisture within ideal range for paddy growth.`,
        confidence: 92,
        impactVector: { ...ZERO_IMPACT, yieldImpact: 5, sustainabilityImpact: 5 },
      });
    }
  }

  // ── Temperature Analysis ──────────────────────────────────
  if (sensors.temperature !== null) {
    const t = sensors.temperature;

    if (t > THRESHOLDS.temperature.critical_max) {
      findings.push({
        ...base, id: nextFindingId(), severity: "critical",
        finding: `Extreme heat: ${t}°C`,
        detail: `Temperature at ${t}°C exceeds ${THRESHOLDS.temperature.critical_max}°C. Spikelet sterility risk is severe. Avoid field operations.`,
        confidence: 95,
        impactVector: { yieldImpact: -30, costImpactRM: 0, riskChange: 0.5, sustainabilityImpact: -10 },
      });
    } else if (t > THRESHOLDS.temperature.warning_max) {
      findings.push({
        ...base, id: nextFindingId(), severity: "warning",
        finding: `Heat stress developing: ${t}°C`,
        detail: `Temperature at ${t}°C exceeds comfortable range. Photosynthesis efficiency may drop.`,
        confidence: 88,
        impactVector: { yieldImpact: -8, costImpactRM: 0, riskChange: 0.15, sustainabilityImpact: -3 },
      });
    } else if (t <= THRESHOLDS.temperature.optimal_max) {
      findings.push({
        ...base, id: nextFindingId(), severity: "positive",
        finding: `Temperature within optimal range: ${t}°C`,
        detail: `Growing conditions are favorable for paddy.`,
        confidence: 90,
        impactVector: { ...ZERO_IMPACT, yieldImpact: 3 },
      });
    }
  }

  // ── Humidity Analysis ─────────────────────────────────────
  if (sensors.humidity !== null) {
    const h = sensors.humidity;

    if (h > THRESHOLDS.humidity.severe_fungal) {
      findings.push({
        ...base, id: nextFindingId(), severity: "critical",
        finding: `Severe fungal risk: humidity ${h}%`,
        detail: `Humidity at ${h}% creates ideal conditions for blast and blight. Immediate fungicide scouting recommended.`,
        confidence: 85,
        impactVector: { yieldImpact: -15, costImpactRM: 300, riskChange: 0.3, sustainabilityImpact: -8 },
      });
    } else if (h > THRESHOLDS.humidity.fungal_risk) {
      findings.push({
        ...base, id: nextFindingId(), severity: "warning",
        finding: `Elevated fungal risk: humidity ${h}%`,
        detail: `Humidity above ${THRESHOLDS.humidity.fungal_risk}% increases disease pressure. Monitor closely.`,
        confidence: 80,
        impactVector: { yieldImpact: -5, costImpactRM: 150, riskChange: 0.15, sustainabilityImpact: -5 },
      });
    }
  }

  // ── Water Level Analysis ──────────────────────────────────
  if (sensors.waterLevel !== null) {
    const w = sensors.waterLevel;

    if (w < THRESHOLDS.waterLevel.critical_low) {
      findings.push({
        ...base, id: nextFindingId(), severity: "critical",
        finding: `Critical water level: ${w} cm`,
        detail: `Paddy field water level at ${w} cm is dangerously low. Check water inlet immediately.`,
        confidence: 90,
        impactVector: { yieldImpact: -20, costImpactRM: 100, riskChange: 0.3, sustainabilityImpact: -10 },
      });
    } else if (w < THRESHOLDS.waterLevel.warning_low) {
      findings.push({
        ...base, id: nextFindingId(), severity: "warning",
        finding: `Low water level: ${w} cm`,
        detail: `Water level below optimal. Schedule replenishment.`,
        confidence: 85,
        impactVector: { yieldImpact: -8, costImpactRM: 50, riskChange: 0.15, sustainabilityImpact: -5 },
      });
    } else if (w > THRESHOLDS.waterLevel.flood_warning) {
      findings.push({
        ...base, id: nextFindingId(), severity: "warning",
        finding: `High water level: ${w} cm`,
        detail: `Water level at ${w} cm approaching flood risk. Monitor outflow.`,
        confidence: 82,
        impactVector: { yieldImpact: -5, costImpactRM: 80, riskChange: 0.2, sustainabilityImpact: -3 },
      });
    }
  }

  return findings;
}
