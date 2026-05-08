// ============================================================
// Economic Intelligence Agent
// ============================================================

import type { AgentFinding, MarketSnapshot } from "./types";

let findingCounter = 0;
function nextId(): string {
  return `ei-${++findingCounter}-${Date.now()}`;
}

const unavailableMarket = (error: string): MarketSnapshot => ({
  status: "unavailable",
  fertilizers: [],
  paddyPricePerKgRM: null,
  demandLevel: null,
  source: "Market API",
  error,
});

export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const url = import.meta.env.VITE_MARKET_API_URL;
  if (!url) {
    return unavailableMarket("No market API configured. Set VITE_MARKET_API_URL to enable market intelligence.");
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return unavailableMarket(`Market API returned ${response.status}.`);
    }

    const data = await response.json();
    const fertilizers = Array.isArray(data.fertilizers) ? data.fertilizers : [];

    return {
      status: "available",
      fertilizers: fertilizers
        .map((item: any) => ({
          name: String(item.name ?? ""),
          priceRM: Number(item.priceRM ?? item.price ?? 0),
          trend: item.trend === "up" || item.trend === "down" ? item.trend : "stable",
          weeklyChangePct: Number(item.weeklyChangePct ?? item.weekly_change_pct ?? 0),
        }))
        .filter((item: MarketSnapshot["fertilizers"][number]) => item.name && Number.isFinite(item.priceRM)),
      paddyPricePerKgRM: Number.isFinite(Number(data.paddyPricePerKgRM ?? data.paddy_price_per_kg_rm))
        ? Number(data.paddyPricePerKgRM ?? data.paddy_price_per_kg_rm)
        : null,
      demandLevel: data.demandLevel === "high" || data.demandLevel === "moderate" || data.demandLevel === "low"
        ? data.demandLevel
        : null,
      source: data.source ? String(data.source) : url,
    };
  } catch (error) {
    return unavailableMarket(error instanceof Error ? error.message : "Market API unavailable.");
  }
}

export function runEconomicIntelAgent(market: MarketSnapshot): AgentFinding[] {
  const findings: AgentFinding[] = [];
  const ts = new Date().toISOString();
  const base = { agentId: "economic-intel" as const, agentName: "Economic Intelligence", timestamp: ts, dataSources: [market.source] };

  if (market.status === "unavailable") {
    return [{
      ...base,
      id: nextId(),
      severity: "info",
      finding: "Market data unavailable",
      detail: market.error ?? "No market feed is currently connected, so economic optimization is excluded from this cycle.",
      confidence: 100,
      impactVector: { yieldImpact: 0, costImpactRM: 0, riskChange: 0, sustainabilityImpact: 0 },
    }];
  }

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

  if (market.demandLevel === "high" && market.paddyPricePerKgRM !== null) {
    findings.push({ ...base, id: nextId(), severity: "positive",
      finding: `Strong paddy demand: RM ${market.paddyPricePerKgRM}/kg`,
      detail: `Favorable selling conditions. Regional demand is high.`,
      confidence: 68,
      impactVector: { yieldImpact: 0, costImpactRM: -200, riskChange: -0.05, sustainabilityImpact: 0 },
    });
  }

  if (market.fertilizers.length === 0) {
    findings.push({ ...base, id: nextId(), severity: "info",
      finding: "No fertilizer prices returned",
      detail: "The market API responded, but no fertilizer price records were available.",
      confidence: 100,
      impactVector: { yieldImpact: 0, costImpactRM: 0, riskChange: 0, sustainabilityImpact: 0 },
    });
    return findings;
  }

  const avg = market.fertilizers.reduce((s, f) => s + f.weeklyChangePct, 0) / market.fertilizers.length;
  findings.push({ ...base, id: nextId(),
    severity: avg > 3 ? "warning" : avg < -2 ? "positive" : "info",
    finding: `Market sentiment: input costs ${avg > 1 ? "rising" : avg < -1 ? "falling" : "stable"}`,
    detail: `Avg fertilizer change: ${avg > 0 ? "+" : ""}${avg.toFixed(1)}%. Paddy: ${market.paddyPricePerKgRM === null ? "unavailable" : `RM ${market.paddyPricePerKgRM}/kg`}. Demand: ${market.demandLevel ?? "unavailable"}.`,
    confidence: 65,
    impactVector: { yieldImpact: 0, costImpactRM: Math.round(avg * 15), riskChange: avg > 3 ? 0.1 : 0, sustainabilityImpact: 0 },
  });

  return findings;
}
