// ============================================================
// Orchestrator Agent
// ============================================================
// Coordinates the perceive → analyze → synthesize → recommend
// pipeline. This is the "brain" that makes SmartPaddy agentic.
// ============================================================

import type { NormalizedSensors } from "@/lib/sensors";
import { runWeatherDisasterAgent } from "@/lib/weatherDisasterAgent";

import { runFieldMonitorAgent } from "./fieldMonitorAgent";
import { runCropHealthAgent } from "./cropHealthAgent";
import { fetchMarketSnapshot, runEconomicIntelAgent } from "./economicIntelAgent";
import { runYieldForecastAgent } from "./yieldForecastAgent";
import { generateScenarioTree, buildExplainableRecommendation } from "./scenarioEngine";

import type {
  AgentFinding,
  AgentMeta,
  DiseaseResult,
  FarmContext,
  OrchestratorPhase,
  PerceptionResult,
  RiskProfile,
  UserGoal,
} from "./types";
import { createEmptyFarmContext, DEFAULT_USER_GOAL } from "./types";

export type OrchestratorListener = (ctx: FarmContext) => void;

type SmartPaddyDebugWindow = Window & {
  triggerDisaster?: (active?: boolean) => void;
  triggerDisease?: (label: string, confidence?: number) => void;
};

// ── Orchestrator class ──────────────────────────────────────

export class Orchestrator {
  private context: FarmContext;
  private listeners: OrchestratorListener[] = [];
  private latestSensors: NormalizedSensors | null = null;
  private latestDiseases: DiseaseResult[] = [];
  private isMockDisasterActive = false;

  constructor() {
    this.context = createEmptyFarmContext();
    // Expose to window for manual testing of Synthesizer Agent
    if (typeof window !== "undefined") {
      (window as SmartPaddyDebugWindow).triggerDisaster = (active: boolean = true) => {
        this.triggerMockDisaster(active);
      };
      (window as SmartPaddyDebugWindow).triggerDisease = (label: string, confidence: number = 0.85) => {
        this.updateDiseases([{
          label,
          confidence,
          zone: "North Zone",
          source: "Manual Console Trigger",
          timestamp: new Date().toISOString()
        }]);
        this.runFullCycle();
        console.log(`Simulated ${label} detection at ${confidence * 100}%. Dashboard updating...`);
      };
    }
  }

  // Manual trigger for testing Synthesizer Agent
  triggerMockDisaster(active: boolean = true) {
    this.isMockDisasterActive = active;
    this.runFullCycle();
  }

  // Subscribe to context updates
  subscribe(listener: OrchestratorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit() {
    const snapshot = { ...this.context };
    for (const l of this.listeners) {
      try { l(snapshot); } catch { /* listener error */ }
    }
  }

  private setPhase(phase: OrchestratorPhase) {
    this.context.phase = phase;
    this.emit();
  }

  private setAgentStatus(agentId: string, status: AgentMeta["status"], durationMs?: number) {
    const agent = this.context.agentStatuses.find(a => a.id === agentId);
    if (agent) {
      agent.status = status;
      if (status === "done" || status === "error") {
        agent.lastRunAt = new Date().toISOString();
      }
      if (durationMs !== undefined) {
        agent.durationMs = durationMs;
      }
    }
    this.emit();
  }

  // Feed live sensor data (called from Firebase listener)
  updateSensors(sensors: NormalizedSensors) {
    this.latestSensors = sensors;
  }

  // Feed disease scan results
  updateDiseases(diseases: DiseaseResult[]) {
    this.latestDiseases = diseases;
  }

  // Set user goal
  setGoal(goal: UserGoal) {
    this.context.userGoal = goal;
    this.emit();
  }

  // Get current context snapshot
  getContext(): FarmContext {
    return { ...this.context };
  }

  // ── Main pipeline ─────────────────────────────────────────

  async runFullCycle(
    sensorOverride?: NormalizedSensors,
    goalOverride?: UserGoal,
  ): Promise<FarmContext> {
    const cycleId = crypto.randomUUID();
    this.context = {
      ...createEmptyFarmContext(),
      cycleId,
      userGoal: goalOverride ?? this.context.userGoal ?? DEFAULT_USER_GOAL,
    };
    this.emit();

    try {
      // ── PHASE 1: PERCEIVE ───────────────────────────────
      this.setPhase("perceiving");

      const sensors = sensorOverride ?? this.latestSensors;
      if (!sensors || !sensors.hasAnySensorValue) {
        throw new Error("Live Firebase sensor readings are unavailable. Connect sensor_history data before running an agent cycle.");
      }

      // Run weather agent (existing code, real APIs)
      const weatherResult = await runWeatherDisasterAgent(["north", "central", "south"], {
        soilMoisture: sensors.soilMoisture,
        timestamp: sensors.timestamp,
      });

      // Fetch market snapshot from a configured API. If unavailable, the economic agent reports it transparently.
      const market = await fetchMarketSnapshot();

      const perception: PerceptionResult = {
        sensors,
        weather: weatherResult.weather,
        baseline: weatherResult.baseline,
        soil: weatherResult.soil,
        ndvi: weatherResult.ndvi,
        spi: weatherResult.spi,
        monsoon: weatherResult.monsoon,
        weatherAlerts: weatherResult.alerts,
        market,
        diseases: this.latestDiseases,
        timestamp: new Date().toISOString(),
      };

      this.context.perception = perception;
      this.emit();

      // ── PHASE 2: ANALYZE ────────────────────────────────
      this.setPhase("analyzing");
      const allFindings: AgentFinding[] = [];

      // Agent 1: Field Monitor
      const fmStart = Date.now();
      this.setAgentStatus("field-monitor", "running");
      const fmFindings = runFieldMonitorAgent(sensors);
      allFindings.push(...fmFindings);
      this.setAgentStatus("field-monitor", "done", Date.now() - fmStart);

      // Agent 2: Weather-Disaster (findings from existing alerts)
      const wdStart = Date.now();
      this.setAgentStatus("weather-disaster", "running");
      const wdFindings = weatherAlertsToFindings(weatherResult.alerts);
      allFindings.push(...wdFindings);
      this.setAgentStatus("weather-disaster", "done", Date.now() - wdStart);

      // Agent 3: Crop Health
      const chStart = Date.now();
      this.setAgentStatus("crop-health", "running");
      const chFindings = runCropHealthAgent(sensors, weatherResult.ndvi, this.latestDiseases);
      allFindings.push(...chFindings);
      this.setAgentStatus("crop-health", "done", Date.now() - chStart);

      // Agent 4: Economic Intelligence
      const eiStart = Date.now();
      this.setAgentStatus("economic-intel", "running");
      const eiFindings = runEconomicIntelAgent(market);
      allFindings.push(...eiFindings);
      this.setAgentStatus("economic-intel", "done", Date.now() - eiStart);

      // Agent 5: Yield Forecast (depends on other findings)
      const yfStart = Date.now();
      this.setAgentStatus("yield-forecast", "running");
      const { findings: yfFindings, estimate: yieldEstimate } = await runYieldForecastAgent(sensors, allFindings);
      allFindings.push(...yfFindings);
      this.setAgentStatus("yield-forecast", "done", Date.now() - yfStart);

      // ── MOCK DISASTER INJECTION (for testing Synthesizer Agent) ──
      if (this.isMockDisasterActive) {
        allFindings.push({
          id: "mock-disaster-" + Date.now(),
          agentId: "weather-disaster",
          agentName: "Weather & Disaster",
          severity: "critical",
          finding: "CRITICAL: Monsoon surge detected. Extreme flood risk expected.",
          detail: "Flash flooding imminent in next 12 hours. Immediate drainage reinforcement required to protect fertilizer investment.",
          confidence: 98,
          dataSources: ["Manual Test Trigger"],
          timestamp: new Date().toISOString(),
          impactVector: {
            yieldImpact: -35,
            costImpactRM: 500,
            riskChange: 0.85,
            sustainabilityImpact: -20,
          },
        });
      }

      this.context.findings = allFindings;
      this.context.yieldEstimate = yieldEstimate;
      this.emit();

      // ── PHASE 3: SYNTHESIZE ─────────────────────────────
      this.setPhase("synthesizing");

      const riskProfile = synthesizeRiskProfile(allFindings, perception);
      this.context.riskProfile = riskProfile;
      this.emit();

      // ── PHASE 4: RECOMMEND ──────────────────────────────
      this.setPhase("recommending");

      if (!yieldEstimate) {
        this.context.errors.push({
          agentId: "yield-forecast",
          message: "Scenario generation requires a live backend yield prediction.",
          timestamp: new Date().toISOString(),
        });
        this.context.scenarioTree = null;
        this.context.recommendation = null;
      } else if (market.status !== "available" || market.paddyPricePerKgRM === null) {
        this.context.errors.push({
          agentId: "economic-intel",
          message: "Scenario generation requires market price data from a configured API.",
          timestamp: new Date().toISOString(),
        });
        this.context.scenarioTree = null;
        this.context.recommendation = null;
      } else {
        const scenarioTree = generateScenarioTree(
          perception,
          allFindings,
          riskProfile,
          yieldEstimate,
          this.context.userGoal,
        );
        this.context.scenarioTree = scenarioTree;

        const synthStart = Date.now();
        this.setAgentStatus("synthesizer", "running");
        const recommendation = await buildExplainableRecommendation(scenarioTree, allFindings, this.context.userGoal);
        this.context.recommendation = recommendation;
        this.setAgentStatus("synthesizer", "done", Date.now() - synthStart);
      }

      this.context.timestamp = new Date().toISOString();
      this.setPhase("done");

      return this.getContext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown orchestrator error";
      this.context.errors.push({
        agentId: "orchestrator",
        message: msg,
        timestamp: new Date().toISOString(),
      });
      this.setPhase("error");
      return this.getContext();
    }
  }
}

// ── Helper: convert existing AgentAlerts to AgentFindings ────

function weatherAlertsToFindings(alerts: import("@/lib/weatherDisasterAgent").AgentAlert[]): AgentFinding[] {
  return alerts.map((a, i) => ({
    id: `wd-${i}-${Date.now()}`,
    agentId: "weather-disaster" as const,
    agentName: "Weather & Disaster",
    severity: a.type === "CLEAR" ? "positive" as const
      : a.severity === "critical" ? "critical" as const
      : a.severity === "high" ? "warning" as const
      : "info" as const,
    finding: `${a.type} alert in ${a.zone}: ${a.signal.substring(0, 120)}`,
    detail: `${a.prediction} Action: ${a.action}`,
    confidence: a.confidence,
    dataSources: a.sources,
    timestamp: new Date().toISOString(),
    impactVector: {
      yieldImpact: a.type === "FLOOD" ? -18 : a.type === "DROUGHT" ? -15 : a.type === "MONSOON" ? -10 : 3,
      costImpactRM: a.type === "CLEAR" ? 0 : 200,
      riskChange: a.type === "CLEAR" ? -0.1 : a.severity === "critical" ? 0.4 : 0.2,
      sustainabilityImpact: a.type === "CLEAR" ? 5 : -8,
    },
  }));
}

// ── Helper: synthesize risk profile ─────────────────────────

function synthesizeRiskProfile(findings: AgentFinding[], perception: PerceptionResult): RiskProfile {
  let floodRisk = 10;
  let droughtRisk = 10;
  let diseaseRisk = 10;
  let marketRisk = 10;

  for (const f of findings) {
    const mult = f.severity === "critical" ? 2.5 : f.severity === "warning" ? 1.5 : 0.5;
    const risk = Math.abs(f.impactVector.riskChange) * 100 * mult;

    if (f.agentId === "weather-disaster") {
      if (f.finding.toLowerCase().includes("flood") || f.finding.toLowerCase().includes("monsoon")) {
        floodRisk += risk;
      } else if (f.finding.toLowerCase().includes("drought")) {
        droughtRisk += risk;
      }
    } else if (f.agentId === "crop-health") {
      diseaseRisk += risk;
    } else if (f.agentId === "economic-intel") {
      marketRisk += risk;
    } else if (f.agentId === "field-monitor") {
      if (f.finding.toLowerCase().includes("waterlog") || f.finding.toLowerCase().includes("saturated")) {
        floodRisk += risk * 0.5;
      } else if (f.finding.toLowerCase().includes("dry") || f.finding.toLowerCase().includes("low soil")) {
        droughtRisk += risk * 0.5;
      }
    }
  }

  floodRisk = Math.min(100, floodRisk);
  droughtRisk = Math.min(100, droughtRisk);
  diseaseRisk = Math.min(100, diseaseRisk);
  marketRisk = Math.min(100, marketRisk);

  const overallRisk = Math.round((floodRisk * 0.35 + droughtRisk * 0.25 + diseaseRisk * 0.25 + marketRisk * 0.15));

  const critCount = findings.filter(f => f.severity === "critical").length;
  const posCount = findings.filter(f => f.severity === "positive").length;
  const riskTrend: RiskProfile["riskTrend"] = critCount > 1 ? "increasing" : posCount > critCount ? "decreasing" : "stable";

  return {
    overallRisk: Math.round(overallRisk),
    floodRisk: Math.round(floodRisk),
    droughtRisk: Math.round(droughtRisk),
    diseaseRisk: Math.round(diseaseRisk),
    marketRisk: Math.round(marketRisk),
    riskTrend,
  };
}

// ── Fallback sensors for demo mode ──────────────────────────

// ── Singleton instance ──────────────────────────────────────

let _instance: Orchestrator | null = null;

export function getOrchestrator(): Orchestrator {
  if (!_instance) {
    _instance = new Orchestrator();
  }
  return _instance;
}
