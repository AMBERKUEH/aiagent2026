// ============================================================
// Scenario Tree Simulation Engine
// ============================================================
// Generates multiple strategic pathways from the current farm
// context, projects each forward 90 days using parametric
// agronomic models, and ranks them against the user's goal.
// ============================================================

import type {
  AgentFinding,
  AgentId,
  ExplainableRecommendation,
  GoalType,
  ReasoningChainLink,
  ReasoningStep,
  RiskProfile,
  ScenarioNode,
  ScenarioProjections,
  ScenarioTree,
  StrategicAction,
  StrategyType,
  UserGoal,
  YieldEstimate,
  MarketSnapshot,
  PerceptionResult,
} from "./types";
import { callGeminiServer } from "@/lib/serverApi";

// ── Strategy archetypes ─────────────────────────────────────

interface StrategyArchetype {
  type: StrategyType;
  name: string;
  nameBM: string;
  description: string;
  descriptionBM: string;
  icon: string;
  color: string;
  // Weighting multipliers for projections
  yieldMultiplier: number;
  costMultiplier: number;
  riskMultiplier: number;
  sustainabilityBonus: number;
  waterMultiplier: number;
}

const ARCHETYPES: StrategyArchetype[] = [
  {
    type: "aggressive_growth",
    name: "Aggressive Growth",
    nameBM: "Pertumbuhan Agresif",
    description: "Maximize yield through intensive inputs. Higher cost, higher risk, highest potential output.",
    descriptionBM: "Maksimumkan hasil melalui input intensif. Kos lebih tinggi, risiko lebih tinggi, potensi output tertinggi.",
    icon: "rocket_launch",
    color: "#ef4444",
    yieldMultiplier: 1.15,
    costMultiplier: 1.4,
    riskMultiplier: 1.3,
    sustainabilityBonus: -15,
    waterMultiplier: 1.25,
  },
  {
    type: "climate_safe",
    name: "Climate Safe",
    nameBM: "Selamat Iklim",
    description: "Prioritize risk mitigation. Defensive posture against weather threats. Moderate yield, lowest risk.",
    descriptionBM: "Utamakan mitigasi risiko. Postur pertahanan terhadap ancaman cuaca. Hasil sederhana, risiko terendah.",
    icon: "shield",
    color: "#3b82f6",
    yieldMultiplier: 0.92,
    costMultiplier: 1.1,
    riskMultiplier: 0.5,
    sustainabilityBonus: 20,
    waterMultiplier: 0.85,
  },
  {
    type: "cost_saving",
    name: "Cost Saving",
    nameBM: "Jimat Kos",
    description: "Minimize operational expenses. Reduced inputs, lower yield ceiling, but best profit margin per RM spent.",
    descriptionBM: "Minimumkan perbelanjaan operasi. Input dikurangkan, siling hasil lebih rendah, tetapi margin keuntungan terbaik per RM.",
    icon: "savings",
    color: "#22c55e",
    yieldMultiplier: 0.85,
    costMultiplier: 0.6,
    riskMultiplier: 0.9,
    sustainabilityBonus: 10,
    waterMultiplier: 0.75,
  },
  {
    type: "balanced",
    name: "Balanced",
    nameBM: "Seimbang",
    description: "Moderate approach balancing yield, cost, and risk. Recommended when conditions are uncertain.",
    descriptionBM: "Pendekatan sederhana mengimbangi hasil, kos dan risiko. Disyorkan apabila keadaan tidak menentu.",
    icon: "balance",
    color: "#8b5cf6",
    yieldMultiplier: 1.0,
    costMultiplier: 1.0,
    riskMultiplier: 1.0,
    sustainabilityBonus: 5,
    waterMultiplier: 1.0,
  },
];

// ── Actions per strategy archetype ──────────────────────────

function generateActions(
  archetype: StrategyArchetype,
  perception: PerceptionResult,
  findings: AgentFinding[],
): StrategicAction[] {
  const floodRisk = findings.some(f => f.finding.toLowerCase().includes("flood") && f.severity !== "positive");
  const droughtRisk = findings.some(f => f.finding.toLowerCase().includes("drought") || f.finding.toLowerCase().includes("dry"));
  const diseaseRisk = findings.some(f => f.agentId === "crop-health" && (f.severity === "critical" || f.severity === "warning"));
  const priceRising = findings.some(f => f.agentId === "economic-intel" && f.finding.includes("rising"));

  const actions: StrategicAction[] = [];

  switch (archetype.type) {
    case "aggressive_growth":
      actions.push(
        { action: "Apply full-dose NPK fertilizer immediately", actionBM: "Gunakan baja NPK dos penuh segera", timing: "Within 48 hours", costRM: 450, rationale: "Maximize nutrient availability during active growth phase", agentSource: "yield-forecast" },
        { action: "Increase irrigation to optimal saturation", actionBM: "Tingkatkan pengairan ke tahap tepu optimum", timing: "Daily", costRM: 120, rationale: "Maintain soil moisture at 75-80% field capacity", agentSource: "field-monitor" },
        { action: "Apply preventive fungicide", actionBM: "Gunakan racun kulat pencegahan", timing: "Within 72 hours", costRM: 280, rationale: "Protect high-input investment from disease loss", agentSource: "crop-health" },
      );
      if (floodRisk) {
        actions.push({ action: "Prepare emergency drainage channels", actionBM: "Sediakan saluran saliran kecemasan", timing: "Immediate", costRM: 200, rationale: "Protect fertilizer investment from washout", agentSource: "weather-disaster" });
      }
      break;

    case "climate_safe":
      actions.push(
        { action: "Hold fertilizer application until post-monsoon window", actionBM: "Tunda penggunaan baja sehingga selepas monsun", timing: "Delay 72+ hours", costRM: 0, rationale: "Prevent fertilizer washout during predicted rainfall", agentSource: "weather-disaster" },
        { action: "Pre-drain fields to 50% capacity", actionBM: "Salirkan sawah ke 50% kapasiti", timing: "Within 24 hours", costRM: 80, rationale: "Create buffer capacity for incoming precipitation", agentSource: "field-monitor" },
        { action: "Reinforce bunding and check outflow gates", actionBM: "Kukuhkan batas dan periksa pintu aliran keluar", timing: "Within 48 hours", costRM: 150, rationale: "Structural flood protection", agentSource: "weather-disaster" },
      );
      if (diseaseRisk) {
        actions.push({ action: "Scout and spot-treat affected areas only", actionBM: "Tinjau dan rawat kawasan terjejas sahaja", timing: "Within 48 hours", costRM: 120, rationale: "Targeted treatment preserves budget", agentSource: "crop-health" });
      }
      break;

    case "cost_saving":
      actions.push(
        { action: "Apply reduced-rate Urea only (skip NPK this cycle)", actionBM: "Gunakan Urea kadar rendah sahaja (langkau NPK kitaran ini)", timing: "Within 1 week", costRM: 180, rationale: "Minimum effective nitrogen dose", agentSource: "economic-intel" },
        { action: "Rely on rainfall for irrigation", actionBM: "Bergantung kepada hujan untuk pengairan", timing: "Ongoing", costRM: 0, rationale: "Reduce water pumping costs when rain is forecast", agentSource: "field-monitor" },
      );
      if (priceRising) {
        actions.push({ action: "Buy only the minimum fertilizer needed this week", actionBM: "Beli baja minimum yang diperlukan minggu ini", timing: "Immediate", costRM: 120, rationale: "Input prices are rising, so avoid overbuying while covering essential needs", agentSource: "economic-intel" });
      }
      break;

    case "balanced":
      actions.push(
        { action: "Apply moderate NPK at 70% recommended dose", actionBM: "Gunakan NPK sederhana pada 70% dos disyorkan", timing: "Within 48 hours", costRM: 320, rationale: "Balance nutrient input against cost", agentSource: "yield-forecast" },
        { action: "Maintain current irrigation schedule", actionBM: "Kekalkan jadual pengairan semasa", timing: "Ongoing", costRM: 80, rationale: "Current moisture levels are adequate", agentSource: "field-monitor" },
      );
      if (floodRisk) {
        actions.push({ action: "Monitor drainage; prepare but don't activate emergency protocol", actionBM: "Pantau saliran; bersedia tetapi jangan aktifkan protokol kecemasan", timing: "Next 48 hours", costRM: 50, rationale: "Balanced risk preparation", agentSource: "weather-disaster" });
      }
      break;
  }

  return actions;
}

// ── Projection calculator ───────────────────────────────────

function projectScenario(
  archetype: StrategyArchetype,
  yieldEstimate: YieldEstimate,
  riskProfile: RiskProfile,
  market: MarketSnapshot,
  actions: StrategicAction[],
): ScenarioProjections {
  if (market.paddyPricePerKgRM === null) {
    throw new Error("Cannot project scenario profit without market paddy price data.");
  }

  const baseYield = yieldEstimate.adjustedPrediction;
  const projectedYield = baseYield * archetype.yieldMultiplier;
  const yieldBand = yieldEstimate.confidenceBand;
  const bandScale = archetype.yieldMultiplier;

  const totalActionCost = actions.reduce((s, a) => s + Math.max(0, a.costRM), 0);
  const operationalCost = totalActionCost * archetype.costMultiplier;
  const fertilizerCost = actions
    .filter(a => a.action.toLowerCase().includes("fertil") || a.action.toLowerCase().includes("npk") || a.action.toLowerCase().includes("urea"))
    .reduce((s, a) => s + a.costRM, 0);

  // Revenue = yield * area * price (assume 1 ha for projections)
  const revenuePerTon = market.paddyPricePerKgRM * 1000;
  const midProfit = projectedYield * revenuePerTon - operationalCost;

  const climateRisk = Math.min(100, Math.max(0,
    riskProfile.overallRisk * archetype.riskMultiplier
  ));

  const sustainability = Math.min(100, Math.max(0,
    60 + archetype.sustainabilityBonus - (climateRisk * 0.2)
  ));

  const waterUsage = 8000 * archetype.waterMultiplier; // liters per ha baseline

  return {
    yieldTonPerHa: {
      low: Math.round(yieldBand.low * bandScale * 100) / 100,
      mid: Math.round(projectedYield * 100) / 100,
      high: Math.round(yieldBand.high * bandScale * 100) / 100,
    },
    profitRM: {
      low: Math.round((yieldBand.low * bandScale * revenuePerTon - operationalCost * 1.1) * 100) / 100,
      mid: Math.round(midProfit * 100) / 100,
      high: Math.round((yieldBand.high * bandScale * revenuePerTon - operationalCost * 0.9) * 100) / 100,
    },
    operationalCostRM: Math.round(operationalCost),
    climateRiskScore: Math.round(climateRisk),
    sustainabilityScore: Math.round(sustainability),
    waterUsageLiters: Math.round(waterUsage),
    fertilizerCostRM: Math.round(fertilizerCost * archetype.costMultiplier),
  };
}

// ── Reasoning chain builder ─────────────────────────────────

function buildReasoning(
  archetype: StrategyArchetype,
  findings: AgentFinding[],
): ReasoningStep[] {
  const steps: ReasoningStep[] = [];
  let stepNum = 1;

  // Pick top 3-4 most relevant findings for this strategy
  const sorted = [...findings]
    .filter(f => f.severity !== "positive" || archetype.type === "aggressive_growth")
    .sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2, positive: 3 };
      return (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    })
    .slice(0, 4);

  for (const f of sorted) {
    let inference = "";
    switch (archetype.type) {
      case "aggressive_growth":
        inference = f.severity === "critical"
          ? `This risk must be actively managed — the high-input strategy means more is at stake if conditions deteriorate.`
          : `Under aggressive growth, this factor amplifies returns if managed correctly.`;
        break;
      case "climate_safe":
        inference = f.severity === "critical" || f.severity === "warning"
          ? `This confirms the need for defensive positioning. Climate-safe strategy directly addresses this threat.`
          : `Even without active threats, the precautionary approach preserves optionality.`;
        break;
      case "cost_saving":
        inference = `With reduced inputs, the margin for error is smaller. ${f.severity === "critical" ? "This risk should be monitored closely." : "Current conditions support the cost-saving approach."}`;
        break;
      case "balanced":
        inference = `The balanced approach hedges against this by maintaining moderate inputs while keeping reserves for course correction.`;
        break;
    }

    steps.push({
      step: stepNum++,
      agent: f.agentId,
      agentName: f.agentName,
      observation: f.finding,
      inference,
      confidence: f.confidence,
    });
  }

  return steps;
}

// ── Goal alignment scorer ───────────────────────────────────

function scoreGoalAlignment(
  goalType: GoalType,
  projections: ScenarioProjections,
  archetype: StrategyArchetype,
): number {
  const weights: Record<GoalType, { yield: number; profit: number; risk: number; cost: number; water: number; sustain: number }> = {
    maximize_yield:  { yield: 0.45, profit: 0.15, risk: 0.10, cost: 0.05, water: 0.05, sustain: 0.20 },
    maximize_profit: { yield: 0.20, profit: 0.40, risk: 0.10, cost: 0.20, water: 0.05, sustain: 0.05 },
    minimize_risk:   { yield: 0.10, profit: 0.10, risk: 0.50, cost: 0.10, water: 0.05, sustain: 0.15 },
    minimize_cost:   { yield: 0.10, profit: 0.20, risk: 0.10, cost: 0.45, water: 0.10, sustain: 0.05 },
    optimize_water:  { yield: 0.10, profit: 0.10, risk: 0.10, cost: 0.10, water: 0.50, sustain: 0.10 },
    balanced:        { yield: 0.20, profit: 0.20, risk: 0.20, cost: 0.20, water: 0.10, sustain: 0.10 },
  };

  const w = weights[goalType];

  // Normalize scores to 0-100
  const yieldScore = Math.min(100, (projections.yieldTonPerHa.mid / 8) * 100);
  const profitScore = Math.min(100, Math.max(0, (projections.profitRM.mid / 6000) * 100));
  const riskScore = 100 - projections.climateRiskScore; // lower risk = higher score
  const costScore = Math.min(100, Math.max(0, 100 - (projections.operationalCostRM / 30)));
  const waterScore = Math.min(100, Math.max(0, 100 - (projections.waterUsageLiters / 120)));
  const sustainScore = projections.sustainabilityScore;

  const strategyPreference: Partial<Record<GoalType, StrategyType>> = {
    maximize_yield: "aggressive_growth",
    minimize_risk: "climate_safe",
    minimize_cost: "cost_saving",
    optimize_water: "climate_safe",
    balanced: "balanced",
  };

  const goalPrior = strategyPreference[goalType] === archetype.type ? 12 : 0;

  return Math.min(100, Math.round(
    yieldScore * w.yield +
    profitScore * w.profit +
    riskScore * w.risk +
    costScore * w.cost +
    waterScore * w.water +
    sustainScore * w.sustain +
    goalPrior
  ));
}

// ── Main scenario generation ────────────────────────────────

export function generateScenarioTree(
  perception: PerceptionResult,
  findings: AgentFinding[],
  riskProfile: RiskProfile,
  yieldEstimate: YieldEstimate,
  goal: UserGoal,
): ScenarioTree {
  const scenarios: ScenarioNode[] = [];

  for (const archetype of ARCHETYPES) {
    const actions = generateActions(archetype, perception, findings);
    const projections = projectScenario(archetype, yieldEstimate, riskProfile, perception.market, actions);
    const reasoning = buildReasoning(archetype, findings);

    // Budget constraint check
    let budgetOk = true;
    if (goal.budgetRM !== null && projections.operationalCostRM > goal.budgetRM) {
      budgetOk = false;
    }

    const goalAlignment = scoreGoalAlignment(goal.type, projections, archetype);
    const adjustedAlignment = budgetOk ? goalAlignment : Math.max(0, goalAlignment - 25);

    const assumptions = [
      "Current sensor readings remain representative for the next 48 hours",
      "Weather forecast accuracy within +/-30% for 10-day window",
      `Market prices stable within +/-${archetype.type === "cost_saving" ? "5" : "10"}% for projection period`,
    ];

    const breakpoints = [];
    if (perception.weather.rainfall_48h_mm > 50) {
      breakpoints.push("If rainfall exceeds 100mm in 48h, re-evaluate immediately");
    }
    if (riskProfile.floodRisk > 60) {
      breakpoints.push("If flood alert escalates to critical, switch to Climate Safe");
    }

    scenarios.push({
      id: `scenario-${archetype.type}`,
      name: archetype.name,
      nameBM: archetype.nameBM,
      description: archetype.description,
      descriptionBM: archetype.descriptionBM,
      strategyType: archetype.type,
      icon: archetype.icon,
      color: archetype.color,
      actions,
      projections,
      reasoning,
      assumptions,
      breakpoints,
      goalAlignmentScore: adjustedAlignment,
      isRecommended: false, // set after ranking
    });
  }

  // Rank and mark recommendation
  scenarios.sort((a, b) => b.goalAlignmentScore - a.goalAlignmentScore);
  if (scenarios.length > 0) {
    scenarios[0].isRecommended = true;
  }

  return {
    scenarios,
    generatedAt: new Date().toISOString(),
    goal,
    farmContextHash: `${perception.timestamp}-${goal.type}-${goal.budgetRM}`,
  };
}

// ── Global cache for synthesis to avoid quota issues ────────
let lastFindingsHash = "";
let cachedSummaryEN = "";
let cachedSummaryBM = "";

function getFindingsHash(findings: AgentFinding[], goal?: UserGoal): string {
  return JSON.stringify(findings.map((f) => f.agentId + f.finding)) + (goal?.type ?? "");
}

// ── Explainable recommendation builder ──────────────────────

export async function buildExplainableRecommendation(
  tree: ScenarioTree,
  findings: AgentFinding[],
  userGoal?: UserGoal,
): Promise<ExplainableRecommendation | null> {
  const recommended = tree.scenarios.find(s => s.isRecommended);
  if (!recommended) return null;

  const alternatives = tree.scenarios.filter(s => !s.isRecommended);
  const topAlt = alternatives[0];

  // Build reasoning chain
  const chain: ReasoningChainLink[] = [];

  // Why this strategy
  const topFindings = findings
    .filter(f => f.severity === "critical" || f.severity === "warning")
    .slice(0, 2);

  if (topFindings.length > 0 && topAlt) {
    chain.push({
      because: topFindings.map(f => `${f.agentName} reports: ${f.finding}`).join(". "),
      whichMeans: `Under ${topAlt.name}, this would cost RM ${topAlt.projections.operationalCostRM} with ${topAlt.projections.climateRiskScore}% climate risk.`,
      soInstead: `${recommended.name} strategy addresses this with targeted actions costing RM ${recommended.projections.operationalCostRM}.`,
      tradeoff: `This costs ${Math.abs(recommended.projections.yieldTonPerHa.mid - (topAlt?.projections.yieldTonPerHa.mid ?? 0)).toFixed(1)} t/ha yield difference but saves RM ${Math.abs(recommended.projections.operationalCostRM - (topAlt?.projections.operationalCostRM ?? 0))} and reduces risk by ${Math.abs(recommended.projections.climateRiskScore - (topAlt?.projections.climateRiskScore ?? 0))} points.`,
    });
  } else {
    chain.push({
      because: "Current conditions are within normal operating parameters across all agents.",
      whichMeans: `A ${recommended.name} approach is well-suited to the current environment.`,
      soInstead: `This strategy balances yield (${recommended.projections.yieldTonPerHa.mid} t/ha), cost (RM ${recommended.projections.operationalCostRM}), and risk (${recommended.projections.climateRiskScore}%).`,
      tradeoff: `Goal alignment score: ${recommended.goalAlignmentScore}/100 for your selected objective.`,
    });
  }

  // Contributor weights
  const agentWeights: Record<string, number> = {};
  for (const f of findings) {
    const impact = Math.abs(f.impactVector.yieldImpact) + Math.abs(f.impactVector.riskChange * 50);
    agentWeights[f.agentId] = (agentWeights[f.agentId] ?? 0) + impact;
  }
  const totalWeight = Object.values(agentWeights).reduce((s, w) => s + w, 0) || 1;

  const contributors = Object.entries(agentWeights)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([agentId, weight]) => {
      const f = findings.find(f2 => f2.agentId === agentId);
      return {
        agent: agentId as AgentId,
        agentName: f?.agentName ?? agentId,
        finding: f?.finding ?? "",
        weight: Math.round((weight / totalWeight) * 100) / 100,
      };
    });

  let finalSummary = `${recommended.name} strategy is recommended based on current conditions. Projected yield: ${recommended.projections.yieldTonPerHa.mid} t/ha. Operating cost: RM ${recommended.projections.operationalCostRM}. Goal alignment: ${recommended.goalAlignmentScore}/100.`;
  let finalSummaryBM = `Strategi ${recommended.nameBM} disyorkan berdasarkan keadaan semasa. Anggaran hasil: ${recommended.projections.yieldTonPerHa.mid} tan/hektar. Kos operasi: RM ${recommended.projections.operationalCostRM}.`;

  const currentHash = getFindingsHash(findings, userGoal);

  if (import.meta.env.MODE !== "test" && topFindings.length > 0) {
    // Check cache first to save tokens/quota
    if (currentHash === lastFindingsHash && cachedSummaryEN) {
      finalSummary = cachedSummaryEN;
      finalSummaryBM = cachedSummaryBM;
    } else {
      try {
        const conflictPrompt = `
You are the Synthesizer Agent for SmartPaddy.
A farm has the following conflicting agent findings:
${findings.filter((f) => f.severity !== "positive").map((f) => `- ${f.agentName} (${f.severity}): ${f.finding}`).join("\n")}

The farmer's goal is: ${userGoal?.type ?? "balanced"}

The system's recommended strategy is: ${recommended.name} (Yield: ${recommended.projections.yieldTonPerHa.mid} t/ha, Risk: ${recommended.projections.climateRiskScore}%, Cost: RM ${recommended.projections.operationalCostRM})
Alternative strategy is: ${topAlt?.name ?? "None"} (Yield: ${topAlt?.projections.yieldTonPerHa.mid ?? 0} t/ha, Risk: ${topAlt?.projections.climateRiskScore ?? 0}%, Cost: RM ${topAlt?.projections.operationalCostRM ?? 0})

Evaluate the tradeoffs and formulate a short, synthesized summary (max 3 sentences) explaining why the recommended strategy is best despite the conflicting findings. Provide this in both English and Bahasa Malaysia.

Return ONLY a JSON object with this exact structure, without any markdown formatting:
{
  "summaryEN": "...",
  "summaryBM": "..."
}
`;
        const responseText = await callGeminiServer(conflictPrompt);
        const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const synth = JSON.parse(cleanJson);
        if (synth.summaryEN) {
          finalSummary = synth.summaryEN;
          cachedSummaryEN = synth.summaryEN;
        }
        if (synth.summaryBM) {
          finalSummaryBM = synth.summaryBM;
          cachedSummaryBM = synth.summaryBM;
        }
        lastFindingsHash = currentHash;
      } catch (e) {
        console.error("Synthesizer Agent failed:", e);
      }
    }
  }

  return {
    strategyId: recommended.id,
    strategyName: recommended.name,
    verdict: "recommended",
    summary: finalSummary,
    summaryBM: finalSummaryBM,
    chain,
    contributors,
  };
}
