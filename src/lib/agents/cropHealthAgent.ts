// ============================================================
// Crop Health Agent
// ============================================================
// Fuses disease scanner results with environmental stress
// indicators (humidity, temperature, NDVI) to produce a
// holistic crop health assessment.
// ============================================================

import type { NdviReading } from "@/lib/weatherDisasterAgent";
import type { NormalizedSensors } from "@/lib/sensors";
import type { AgentFinding, DiseaseResult } from "./types";

let findingCounter = 0;
function nextId(): string {
  return `ch-${++findingCounter}-${Date.now()}`;
}

export function runCropHealthAgent(
  sensors: NormalizedSensors,
  ndvi: NdviReading[],
  diseases: DiseaseResult[],
): AgentFinding[] {
  const findings: AgentFinding[] = [];
  const ts = new Date().toISOString();
  const base = {
    agentId: "crop-health" as const,
    agentName: "Crop Health",
    timestamp: ts,
  };

  // ── Disease detections ────────────────────────────────────
  for (const d of diseases) {
    if (d.label === "healthy" || d.label === "unknown") continue;

    const isHigh = d.confidence > 0.7;
    findings.push({
      ...base,
      id: nextId(),
      severity: isHigh ? "critical" : "warning",
      finding: `Disease detected: ${d.label} (${(d.confidence * 100).toFixed(0)}%)`,
      detail: `CV scanner identified ${d.label} in ${d.zone} zone with ${(d.confidence * 100).toFixed(1)}% confidence. ${
        isHigh
          ? "Immediate treatment recommended."
          : "Scout affected area for confirmation."
      }`,
      confidence: Math.round(d.confidence * 100),
      dataSources: [d.source, "TFLite EfficientNetB0"],
      impactVector: {
        yieldImpact: isHigh ? -20 : -8,
        costImpactRM: isHigh ? 400 : 150,
        riskChange: isHigh ? 0.35 : 0.15,
        sustainabilityImpact: -5,
      },
    });
  }

  // ── NDVI stress analysis ──────────────────────────────────
  for (const n of ndvi) {
    if (n.drop_pct > 20) {
      findings.push({
        ...base,
        id: nextId(),
        severity: "critical",
        finding: `Severe vegetation stress: NDVI dropped ${n.drop_pct}%`,
        detail: `Zone ${n.zone_id} shows ${n.drop_pct}% NDVI decline from seasonal average (${n.seasonal_avg_ndvi} to ${n.current_ndvi}). Possible nutrient deficiency or undetected disease.`,
        confidence: 75,
        dataSources: [n.source],
        impactVector: {
          yieldImpact: -15,
          costImpactRM: 200,
          riskChange: 0.25,
          sustainabilityImpact: -10,
        },
      });
    } else if (n.drop_pct > 12) {
      findings.push({
        ...base,
        id: nextId(),
        severity: "warning",
        finding: `Moderate vegetation stress: NDVI dropped ${n.drop_pct}%`,
        detail: `Zone ${n.zone_id} vegetation index below seasonal norm. Monitor and consider foliar nutrient application.`,
        confidence: 70,
        dataSources: [n.source],
        impactVector: {
          yieldImpact: -6,
          costImpactRM: 100,
          riskChange: 0.1,
          sustainabilityImpact: -5,
        },
      });
    } else if (n.drop_pct <= 5 && n.current_ndvi > 0.5) {
      findings.push({
        ...base,
        id: nextId(),
        severity: "positive",
        finding: `Healthy vegetation: NDVI ${n.current_ndvi}`,
        detail: `Zone ${n.zone_id} vegetation is within healthy range with minimal deviation from seasonal average.`,
        confidence: 80,
        dataSources: [n.source],
        impactVector: {
          yieldImpact: 3,
          costImpactRM: 0,
          riskChange: -0.05,
          sustainabilityImpact: 5,
        },
      });
    }
  }

  // ── Compound stress: humidity + temperature ───────────────
  if (
    sensors.humidity !== null &&
    sensors.temperature !== null &&
    sensors.humidity > 85 &&
    sensors.temperature > 30
  ) {
    findings.push({
      ...base,
      id: nextId(),
      severity: "warning",
      finding: "Compound stress: high humidity + warm temperature",
      detail: `Humidity ${sensors.humidity}% combined with ${sensors.temperature}°C creates elevated disease pressure. Blast and sheath blight risk increases significantly under these conditions.`,
      confidence: 78,
      dataSources: ["ESP32 IoT Sensors"],
      impactVector: {
        yieldImpact: -8,
        costImpactRM: 200,
        riskChange: 0.2,
        sustainabilityImpact: -5,
      },
    });
  }

  // ── If no disease and healthy NDVI, say so ────────────────
  if (
    findings.length === 0 ||
    findings.every((f) => f.severity === "positive")
  ) {
    const hasPositive = findings.some((f) => f.severity === "positive");
    if (!hasPositive) {
      findings.push({
        ...base,
        id: nextId(),
        severity: "positive",
        finding: "No crop health issues detected",
        detail: "All vegetation indices and disease scans are within normal ranges.",
        confidence: 75,
        dataSources: ["Sentinel-2 NDVI", "TFLite Scanner"],
        impactVector: {
          yieldImpact: 0,
          costImpactRM: 0,
          riskChange: -0.05,
          sustainabilityImpact: 3,
        },
      });
    }
  }

  return findings;
}
