// ============================================================
// Economic Intelligence Agent
// ============================================================

import type { AgentFinding, MarketSnapshot } from "./types";

let findingCounter = 0;
function nextId(): string {
  return `ei-${++findingCounter}-${Date.now()}`;
}

export function generateMarketSnapshot(): MarketSnapshot {
  const now = new Date();
  const weekOfMonth = Math.floor(now.getDate() / 7);
  const dayOfWeek = now.getDay();

  const ureaBase = 95 + Math.sin(weekOfMonth * 1.2) * 8;
  const npkBase = 112 + Math.cos(weekOfMonth * 0.9) * 6;
  const organicBase = 122 + Math.sin(weekOfMonth * 0.7 + 1) * 5;

  const trendFromDelta = (d: number): "up" | "stable" | "down" =>
    d > 2 ? "up" : d < -2 ? "down" : "stable";

  const uD = Math.sin(dayOfWeek * 0.8) * 5;
  const nD = Math.cos(dayOfWeek * 0.6) * 4;
  const oD = Math.sin(dayOfWeek * 0.5 + 2) * 3;

  return {
    fertilizers: [
      { name: "Urea", priceRM: Math.round((ureaBase + uD) * 100) / 100, trend: trendFromDelta(uD), weeklyChangePct: Math.round(uD / ureaBase * 1000) / 10 },
      { name: "NPK 15-15-15", priceRM: Math.round((npkBase + nD) * 100) / 100, trend: trendFromDelta(nD), weeklyChangePct: Math.round(nD / npkBase * 1000) / 10 },
      { name: "Organic Compost", priceRM: Math.round((organicBase + oD) * 100) / 100, trend: trendFromDelta(oD), weeklyChangePct: Math.round(oD / organicBase * 1000) / 10 },
    ],
    paddyPricePerKgRM: Math.round((1.80 + Math.sin(weekOfMonth * 0.4) * 0.15) * 100) / 100,
    demandLevel: weekOfMonth % 3 === 0 ? "high" : weekOfMonth % 3 === 1 ? "moderate" : "low",
    source: "Simulated Market Feed (FAMA model)",
  };
}

export function runEconomicIntelAgent(market: MarketSnapshot): AgentFinding[] {
  const findings: AgentFinding[] = [];
  const ts = new Date().toISOString();
  const base = { agentId: "economic-intel" as const, agentName: "Economic Intelligence", timestamp: ts, dataSources: [market.source] };

  for (const f of market.fertilizers) {
    if (f.trend === "up" && Math.abs(f.weeklyChangePct) > 3) {
      findings.push({ ...base, id: nextId(), severity: "warning",
        finding: `${f.name} price rising: RM ${f.priceRM} (+${f.weeklyChangePct}%)`,
        detail: `${f.name} increased ${f.weeklyChangePct}% to RM ${f.priceRM}/bag. Consider buying now.`,
        confidence: 72,
        impactVector: { yieldImpact: 0, costImpactRM: Math.round(f.weeklyChangePct * 10), riskChange: 0.05, sustainabilityImpact: 0 },
      });
    } else if (f.trend === "down" && Math.abs(f.weeklyChangePct) > 2) {
      findings.push({ ...base, id: nextId(), severity: "info",
        finding: `${f.name} price dropping: RM ${f.priceRM} (${f.weeklyChangePct}%)`,
        detail: `Good purchasing window for ${f.name}.`,
        confidence: 70,
        impactVector: { yieldImpact: 0, costImpactRM: Math.round(f.weeklyChangePct * 10), riskChange: -0.02, sustainabilityImpact: 0 },
      });
    }
  }

  if (market.demandLevel === "high") {
    findings.push({ ...base, id: nextId(), severity: "positive",
      finding: `Strong paddy demand: RM ${market.paddyPricePerKgRM}/kg`,
      detail: `Favorable selling conditions. Regional demand is high.`,
      confidence: 68,
      impactVector: { yieldImpact: 0, costImpactRM: -200, riskChange: -0.05, sustainabilityImpact: 0 },
    });
  }

  const avg = market.fertilizers.reduce((s, f) => s + f.weeklyChangePct, 0) / market.fertilizers.length;
  findings.push({ ...base, id: nextId(),
    severity: avg > 3 ? "warning" : avg < -2 ? "positive" : "info",
    finding: `Market sentiment: input costs ${avg > 1 ? "rising" : avg < -1 ? "falling" : "stable"}`,
    detail: `Avg fertilizer change: ${avg > 0 ? "+" : ""}${avg.toFixed(1)}%. Paddy: RM ${market.paddyPricePerKgRM}/kg. Demand: ${market.demandLevel}.`,
    confidence: 65,
    impactVector: { yieldImpact: 0, costImpactRM: Math.round(avg * 15), riskChange: avg > 3 ? 0.1 : 0, sustainabilityImpact: 0 },
  });

  return findings;
}
