import { useFarmContext } from "@/lib/agents/FarmContextProvider";
import type { AgentFinding, YieldEstimate, RiskProfile } from "@/lib/agents/types";

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Safety checks ───────────────────────────────────────────
interface SafetyCheck {
  label: string;
  icon: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

function runSafetyChecks(
  hasLiveSensors: boolean,
  findings: AgentFinding[],
  riskProfile: RiskProfile | null,
): SafetyCheck[] {
  const checks: SafetyCheck[] = [];

  // 1. Sensor Safety
  checks.push({
    label: "Sensor Safety",
    icon: "sensors",
    status: hasLiveSensors ? "pass" : "fail",
    detail: hasLiveSensors
      ? "Live IoT sensor data is available."
      : "Sensor data missing — recommendation is partial.",
  });

  // 2. Weather Safety
  const weatherFindings = findings.filter(f => f.agentId === "weather-disaster");
  const hasWeather = weatherFindings.length > 0;
  checks.push({
    label: "Weather Safety",
    icon: "cloud",
    status: hasWeather ? "pass" : "warning",
    detail: hasWeather
      ? "Weather data verified from external APIs."
      : "Weather data unavailable — fertilizer timing unverified.",
  });

  // 3. Market Safety
  const marketFindings = findings.filter(f => f.agentId === "economic-intel");
  const marketOk = marketFindings.some(f => f.finding.toLowerCase().includes("price") || f.severity === "positive" || f.severity === "info");
  checks.push({
    label: "Market Safety",
    icon: "trending_up",
    status: marketOk ? "pass" : "warning",
    detail: marketOk
      ? "Market price data is live."
      : "Market data unavailable — profit labelled as estimate.",
  });

  // 4. Disease Confidence Safety
  const diseaseFindings = findings.filter(f => f.agentId === "crop-health" && f.finding.toLowerCase().includes("disease"));
  const worstDisease = diseaseFindings.sort((a, b) => b.confidence - a.confidence)[0];
  if (worstDisease) {
    const conf = worstDisease.confidence;
    checks.push({
      label: "Disease Confidence",
      icon: "coronavirus",
      status: conf >= 80 ? "pass" : conf >= 50 ? "warning" : "fail",
      detail: conf >= 80
        ? `Likely disease: ${worstDisease.finding} (${conf}%)`
        : conf >= 50
          ? `Possible disease (${conf}%) — retake photo / monitor.`
          : `Uncertain (${conf}%) — do not diagnose.`,
    });
  } else {
    checks.push({
      label: "Disease Confidence",
      icon: "coronavirus",
      status: "pass",
      detail: "No disease detected.",
    });
  }

  // 5. LLM / Advice Safety (compliance)
  const overallRisk = riskProfile?.overallRisk ?? 0;
  const hasCritical = findings.some(f => f.severity === "critical");
  checks.push({
    label: "Advice Safety",
    icon: "verified_user",
    status: hasCritical ? "warning" : overallRisk > 60 ? "warning" : "pass",
    detail: hasCritical
      ? "Critical findings present — include verification note."
      : overallRisk > 60
        ? "High risk — recommendation should be verified by farmer."
        : "Advice confidence is acceptable.",
  });

  return checks;
}

// ── Compliance score ────────────────────────────────────────
function calcComplianceScore(checks: SafetyCheck[]): number {
  let score = 100;
  for (const c of checks) {
    if (c.status === "warning") score -= 10;
    if (c.status === "fail") score -= 20;
  }
  return Math.max(0, score);
}

// ── Agent display config ────────────────────────────────────
const AGENTS = [
  { id: "field-monitor", name: "Field Monitor Agent", icon: "sensors", color: "#16a34a" },
  { id: "weather-disaster", name: "Weather Agent", icon: "cloud", color: "#3b82f6" },
  { id: "crop-health", name: "Crop Health Agent", icon: "local_florist", color: "#22c55e" },
  { id: "yield-forecast", name: "Yield Forecast Agent", icon: "analytics", color: "#8b5cf6" },
  { id: "economic-intel", name: "Market Agent", icon: "trending_up", color: "#f59e0b" },
  { id: "safety", name: "Safety Agent", icon: "shield", color: "#10b981" },
  { id: "compliance", name: "Compliance Agent", icon: "verified", color: "#06b6d4" },
  { id: "synthesizer", name: "Synthesizer Agent (BFC)", icon: "hub", color: "#6366f1" },
];

const STATUS_DOT: Record<string, string> = {
  pass: "bg-emerald-500",
  warning: "bg-amber-500",
  fail: "bg-red-500",
};

export default function AgentPanel({ isOpen, onClose }: AgentPanelProps) {
  const { ctx, hasLiveSensors } = useFarmContext();
  const { findings, riskProfile, yieldEstimate, recommendation, perception } = ctx;
  const isDone = ctx.phase === "done";

  const safetyChecks = runSafetyChecks(hasLiveSensors, findings, riskProfile);
  const complianceScore = calcComplianceScore(safetyChecks);

  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // Build per-agent summary
  function getAgentContent(id: string): { finding: string; details?: string; confidence?: number } {
    if (id === "safety") {
      const warns = safetyChecks.filter(c => c.status !== "pass");
      return {
        finding: warns.length === 0
          ? "All safety checks passed."
          : `${warns.length} safety concern${warns.length > 1 ? "s" : ""} detected.`,
        details: warns.map(w => w.detail).join(" "),
        confidence: 100,
      };
    }
    if (id === "compliance") {
      return {
        finding: `Compliance score: ${complianceScore}%`,
        details: complianceScore >= 80
          ? "AI suggestion confidence is acceptable."
          : "Some agent outputs have low confidence — verify before acting.",
        confidence: complianceScore,
      };
    }
    if (id === "yield-forecast" && yieldEstimate) {
      return {
        finding: `Yield: ${yieldEstimate.adjustedPrediction} t/ha (base ${yieldEstimate.basePrediction})`,
        details: yieldEstimate.adjustments.map(a => `${a.reason}: ${a.delta > 0 ? "+" : ""}${a.delta} t/ha`).join("; ") || "No adjustments.",
        confidence: yieldEstimate.modelConfidence,
      };
    }
    if (id === "synthesizer" && recommendation) {
      return {
        finding: recommendation.strategyName,
        details: recommendation.summary,
      };
    }
    // Generic: find matching findings
    const agentFindings = findings.filter(f => f.agentId === id);
    if (agentFindings.length > 0) {
      const top = agentFindings[0];
      return { finding: top.finding, details: top.detail, confidence: top.confidence };
    }
    return { finding: isDone ? "No issues detected." : "Waiting..." };
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 bottom-0 z-[2001] w-[360px] max-w-[92vw] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-headline text-base font-bold text-slate-900">AI Farmer Council</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">8 agents analyzing your field</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined text-slate-500 text-base">close</span>
          </button>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {AGENTS.map((agent) => {
            const status = ctx.agentStatuses.find(a => a.id === agent.id);
            const isRunning = status?.status === "running";
            const content = getAgentContent(agent.id);

            return (
              <div key={agent.id} className={`p-3 rounded-2xl border transition-all ${
                isRunning ? "border-primary/30 bg-primary/5 animate-pulse" : "border-slate-100 bg-white hover:border-slate-200"
              }`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: agent.color + "15" }}>
                    <span className="material-symbols-outlined text-sm" style={{ color: agent.color, fontVariationSettings: "'FILL' 1" }}>{agent.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800 truncate">{agent.name}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{timeStr}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed line-clamp-2">{content.finding}</p>
                    {content.details && (
                      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed line-clamp-2 italic">{content.details}</p>
                    )}
                    {content.confidence !== undefined && isDone && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${content.confidence}%`, background: agent.color }} />
                        </div>
                        <span className="text-[9px] font-bold text-slate-400">{content.confidence}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Safety Agent: show checks */}
                {agent.id === "safety" && isDone && (
                  <div className="mt-2 space-y-1 pl-11">
                    {safetyChecks.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[c.status]}`} />
                        <span className="font-medium text-slate-600">{c.label}:</span>
                        <span className="text-slate-400 truncate">{c.detail}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Yield Agent: show adjustment breakdown */}
                {agent.id === "yield-forecast" && isDone && yieldEstimate && yieldEstimate.adjustments.length > 0 && (
                  <div className="mt-2 space-y-1 pl-11">
                    {yieldEstimate.adjustments.map((a, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <span className={`font-mono font-bold ${a.delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {a.delta >= 0 ? "+" : ""}{a.delta.toFixed(2)}
                        </span>
                        <span className="text-slate-400 truncate">{a.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* AI Conclusion */}
        {recommendation && isDone && (
          <div className="mx-4 mb-3 p-4 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-sm text-emerald-400" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">AI Conclusion</span>
              <span className="ml-auto text-[10px] font-bold text-emerald-300">Compliance: {complianceScore}%</span>
            </div>
            <h3 className="font-headline text-sm font-bold leading-tight">{recommendation.strategyName}</h3>
            <p className="text-[11px] text-white/70 mt-1 leading-relaxed line-clamp-3">{recommendation.summary}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-slate-400">
            {ctx.agentStatuses.filter(a => a.status === "done").length} agents consulted
          </span>
        </div>
      </aside>
    </>
  );
}
