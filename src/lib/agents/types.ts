// ============================================================
// SmartPaddy Multi-Agent Type System
// ============================================================
// This is the shared brain. Every agent reads from and writes to
// FarmContext. The Orchestrator assembles it, the Scenario Engine
// consumes it, and the UI renders it.
// ============================================================

import type { NormalizedSensors } from "@/lib/sensors";
import type {
  WeatherForecast,
  HistoricalBaseline,
  SoilReading,
  NdviReading,
  SpiReading,
  MonsoonTrack,
  AgentAlert,
} from "@/lib/weatherDisasterAgent";

// ── Agent Identity ──────────────────────────────────────────

export type AgentId =
  | "field-monitor"
  | "weather-disaster"
  | "crop-health"
  | "economic-intel"
  | "yield-forecast"
  | "orchestrator"
  | "scenario-engine"
  | "advisory";

export type AgentStatus = "idle" | "running" | "done" | "error";

export interface AgentMeta {
  id: AgentId;
  name: string;
  icon: string; // Material Symbols icon name
  status: AgentStatus;
  lastRunAt: string | null;
  durationMs: number | null;
}

// ── Agent Findings ──────────────────────────────────────────

export type FindingSeverity = "critical" | "warning" | "info" | "positive";

export interface ImpactVector {
  yieldImpact: number;          // -100 to +100 percentage points
  costImpactRM: number;         // estimated RM change (positive = cost increase)
  riskChange: number;           // -1 to +1 (positive = more risk)
  sustainabilityImpact: number; // -100 to +100
}

export interface AgentFinding {
  id: string;
  agentId: AgentId;
  agentName: string;
  severity: FindingSeverity;
  finding: string;
  detail: string;
  confidence: number;          // 0-100
  dataSources: string[];
  timestamp: string;
  impactVector: ImpactVector;
}

// ── Perception Layer ────────────────────────────────────────

export interface MarketSnapshot {
  status: "available" | "unavailable";
  fertilizers: {
    name: string;
    priceRM: number;
    trend: "up" | "stable" | "down";
    weeklyChangePct: number;
  }[];
  paddyPricePerKgRM: number | null;
  demandLevel: "high" | "moderate" | "low" | null;
  source: string;
  error?: string;
}

export interface DiseaseResult {
  label: string;
  confidence: number;
  zone: string;
  timestamp: string;
  source: string;
}

export interface PerceptionResult {
  sensors: NormalizedSensors;
  weather: WeatherForecast;
  baseline: HistoricalBaseline;
  soil: SoilReading[];
  ndvi: NdviReading[];
  spi: SpiReading[];
  monsoon: MonsoonTrack;
  weatherAlerts: AgentAlert[];
  market: MarketSnapshot;
  diseases: DiseaseResult[];
  timestamp: string;
}

// ── Risk Profile ────────────────────────────────────────────

export interface RiskProfile {
  overallRisk: number;         // 0-100
  floodRisk: number;
  droughtRisk: number;
  diseaseRisk: number;
  marketRisk: number;
  riskTrend: "increasing" | "stable" | "decreasing";
}

// ── Yield Estimate ──────────────────────────────────────────

export interface YieldEstimate {
  basePrediction: number;        // t/ha from XGBoost
  adjustedPrediction: number;    // after agent adjustments
  confidenceBand: { low: number; mid: number; high: number };
  adjustments: {
    source: AgentId;
    reason: string;
    delta: number; // t/ha change
  }[];
  modelConfidence: number;       // 0-100
}

// ── User Goal ───────────────────────────────────────────────

export type GoalType =
  | "maximize_yield"
  | "maximize_profit"
  | "minimize_risk"
  | "minimize_cost"
  | "optimize_water"
  | "balanced";

export interface UserGoal {
  type: GoalType;
  label: string;
  budgetRM: number | null;
  constraints: string[];
}

export const GOAL_PRESETS: Record<GoalType, { label: string; labelBM: string; icon: string }> = {
  maximize_yield:  { label: "Maximize Yield",          labelBM: "Maksimumkan Hasil",     icon: "trending_up" },
  maximize_profit: { label: "Maximize Profit",         labelBM: "Maksimumkan Keuntungan", icon: "payments" },
  minimize_risk:   { label: "Minimize Climate Risk",   labelBM: "Kurangkan Risiko Iklim", icon: "shield" },
  minimize_cost:   { label: "Minimize Cost",           labelBM: "Kurangkan Kos",          icon: "savings" },
  optimize_water:  { label: "Optimize Water Usage",    labelBM: "Optimumkan Penggunaan Air", icon: "water_drop" },
  balanced:        { label: "Balanced Strategy",       labelBM: "Strategi Seimbang",      icon: "balance" },
};

// ── Scenario Tree ───────────────────────────────────────────

export type StrategyType =
  | "aggressive_growth"
  | "cost_saving"
  | "climate_safe"
  | "balanced";

export interface StrategicAction {
  action: string;
  actionBM: string;
  timing: string;
  costRM: number;
  rationale: string;
  agentSource: AgentId;
}

export interface ReasoningStep {
  step: number;
  agent: AgentId;
  agentName: string;
  observation: string;
  inference: string;
  confidence: number;
}

export interface ScenarioProjections {
  yieldTonPerHa: { low: number; mid: number; high: number };
  profitRM: { low: number; mid: number; high: number };
  operationalCostRM: number;
  climateRiskScore: number;      // 0-100
  sustainabilityScore: number;   // 0-100
  waterUsageLiters: number;
  fertilizerCostRM: number;
}

export interface ScenarioNode {
  id: string;
  name: string;
  nameBM: string;
  description: string;
  descriptionBM: string;
  strategyType: StrategyType;
  icon: string;
  color: string;

  actions: StrategicAction[];
  projections: ScenarioProjections;
  reasoning: ReasoningStep[];
  assumptions: string[];
  breakpoints: string[]; // conditions that invalidate this scenario

  // Scoring (filled by ranker)
  goalAlignmentScore: number;   // 0-100, how well this matches user goal
  isRecommended: boolean;
}

export interface ScenarioTree {
  scenarios: ScenarioNode[];
  generatedAt: string;
  goal: UserGoal;
  farmContextHash: string; // to detect if re-generation needed
}

// ── Explainable Recommendation ──────────────────────────────

export interface ReasoningChainLink {
  because: string;
  whichMeans: string;
  soInstead: string;
  tradeoff: string;
}

export interface ExplainableRecommendation {
  strategyId: string;
  strategyName: string;
  verdict: "recommended" | "alternative" | "not_recommended";
  summary: string;
  summaryBM: string;
  chain: ReasoningChainLink[];
  contributors: {
    agent: AgentId;
    agentName: string;
    finding: string;
    weight: number; // 0-1, how much this agent influenced the recommendation
  }[];
}

// ── Full Farm Context ───────────────────────────────────────

export type OrchestratorPhase =
  | "idle"
  | "perceiving"
  | "analyzing"
  | "synthesizing"
  | "recommending"
  | "done"
  | "error";

export interface FarmContext {
  // Metadata
  timestamp: string;
  farmId: string;
  cycleId: string; // unique per orchestration cycle

  // Phase tracking
  phase: OrchestratorPhase;
  agentStatuses: AgentMeta[];

  // Layer 1: Raw Perception
  perception: PerceptionResult | null;

  // Layer 2: Agent Findings
  findings: AgentFinding[];

  // Layer 3: Synthesized Intelligence
  riskProfile: RiskProfile | null;
  yieldEstimate: YieldEstimate | null;

  // Layer 4: User Goal
  userGoal: UserGoal;

  // Layer 5: Scenarios & Recommendations
  scenarioTree: ScenarioTree | null;
  recommendation: ExplainableRecommendation | null;

  // Errors
  errors: { agentId: AgentId; message: string; timestamp: string }[];
}

// ── Defaults ────────────────────────────────────────────────

export const DEFAULT_USER_GOAL: UserGoal = {
  type: "balanced",
  label: "Balanced Strategy",
  budgetRM: 5000,
  constraints: [],
};

export function createEmptyFarmContext(): FarmContext {
  return {
    timestamp: new Date().toISOString(),
    farmId: "smartpaddy-my-01",
    cycleId: crypto.randomUUID(),
    phase: "idle",
    agentStatuses: [
      { id: "field-monitor",    name: "Field Monitor",         icon: "sensors",               status: "idle", lastRunAt: null, durationMs: null },
      { id: "weather-disaster", name: "Weather & Disaster",    icon: "thunderstorm",          status: "idle", lastRunAt: null, durationMs: null },
      { id: "crop-health",      name: "Crop Health",            icon: "local_florist",         status: "idle", lastRunAt: null, durationMs: null },
      { id: "economic-intel",   name: "Economic Intelligence", icon: "account_balance",       status: "idle", lastRunAt: null, durationMs: null },
      { id: "yield-forecast",   name: "Yield Forecast",        icon: "analytics",             status: "idle", lastRunAt: null, durationMs: null },
    ],
    perception: null,
    findings: [],
    riskProfile: null,
    yieldEstimate: null,
    userGoal: DEFAULT_USER_GOAL,
    scenarioTree: null,
    recommendation: null,
    errors: [],
  };
}
