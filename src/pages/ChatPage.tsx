import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { rtdb } from "@/lib/firebase";
import { normalizeSensorPayload } from "@/lib/sensors";
import { searchAgricultureDocs } from "@/lib/supabase";
import { ref, onValue } from "firebase/database";
import ReactMarkdown from "react-markdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";
import { generateScenarioTree } from "@/lib/agents/scenarioEngine";
import type { FarmContext } from "@/lib/agents/types";

type Lang = "BM" | "EN";
type DocumentLanguage = "bm" | "en";
const EMOJI_RICE = "\u{1F33E}";
const EMOJI_DROPLET = "\u{1F4A7}";
const EMOJI_THERMOMETER = "\u{1F321}\uFE0F";
const EMOJI_SUN = "\u2600\uFE0F";
const WARNING_LABEL = "\u26A0\uFE0F Offline";


interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  lang: Lang;
  isOffline?: boolean;
  involvedAgents?: string[];
  imageUrl?: string;
  imageAlt?: string;
  scanResult?: InlineScanResult;
}

type InlineScanResult = {
  diseaseName: string;
  confidence: number;
  status: string;
  summary: string;
  recommendation: string;
  possibleRisks: string[];
  fileName: string;
};

const emptyScanResult: InlineScanResult = {
  diseaseName: "No scan yet",
  confidence: 0,
  status: "idle",
  summary: "Upload a paddy leaf image to run the backend disease scan.",
  recommendation: "The scan result will appear here and will also update the crop-health agent context.",
  possibleRisks: [],
  fileName: "",
};

const SYSTEM_PROMPT: Record<Lang, string> = {
  BM: "You are SmartPaddy, an AI farming advisory agent for Malaysian B40 paddy farmers. Always respond in Bahasa Malaysia. Keep answers short, practical, and simple. You will receive: (1) live sensor readings, (2) agent findings from our multi-agent system (weather, crop health, yield, market agents), (3) the current recommended strategy and scenario comparison. Use ALL of this context to give highly specific, actionable advice. When farmers ask 'why', explain the reasoning chain from our agents. Only answer about paddy farming and Malaysian agriculture. End every response with one clear action.",
  EN: "You are SmartPaddy, an AI farming advisory agent for Malaysian paddy farmers. Always respond in English. Keep answers short, practical, and actionable. You will receive: (1) live sensor readings, (2) agent findings from our multi-agent system (weather, crop health, yield, market agents), (3) the current recommended strategy and scenario comparison. Use ALL of this context to give highly specific, data-driven advice. When farmers ask 'why', trace the reasoning back through agent findings. Only answer about paddy farming and Malaysian agriculture. End every response with one clear recommended action.",
};

const QUICK_REPLIES: Record<Lang, string[]> = {
  BM: ["Apa jadi jika saya menuai hari ini?", "Kenapa strategi ini disyorkan?", "Bila nak siram padi?", "Berapa harga baja urea?"],
  EN: ["What if I crop today?", "Why is this strategy recommended?", "When should I irrigate?", "What is the price of urea fertilizer?"],
};

const PLACEHOLDERS: Record<Lang, string> = {
  BM: "Tanya soalan pertanian...",
  EN: "Ask a farming question...",
};

const AGENT_MESSAGES: Record<Lang, { planning: string; simulating: string; routing: string; analyzing: string }> = {
  BM: {
    planning: "*(Planner Agent sedang merancang...)*",
    simulating: "*(Menjalankan simulasi...)*",
    routing: "Merancang Laluan...",
    analyzing: "Menganalisis Konteks...",
  },
  EN: {
    planning: "*(Planner Agent is routing...)*",
    simulating: "*(Running simulation...)*",
    routing: "Routing Request...",
    analyzing: "Analyzing Context...",
  },
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to encode the selected image."));
    };
    reader.onerror = () => reject(new Error("Unable to read the selected image."));
    reader.readAsDataURL(file);
  });

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());

const asString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

const asNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeConfidence = (value: unknown) => {
  const numeric = asNumber(value) ?? 0;
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(percent)));
};

const pickString = (source: Record<string, unknown>, keys: string[], fallback: string) => {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value) return value;
  }
  return fallback;
};

const normalizeInlineScanResponse = (payload: unknown, fileName: string): InlineScanResult => {
  if (!payload || typeof payload !== "object") {
    return {
      ...emptyScanResult,
      diseaseName: "Unexpected response",
      status: "error",
      summary: "The backend returned a scan response, but it was not valid JSON.",
      recommendation: "Check the backend disease scanner contract before trying another image.",
      fileName,
    };
  }

  const source = payload as Record<string, unknown>;
  const status = pickString(source, ["status"], "ok");

  if (status === "model_not_ready") {
    return {
      ...emptyScanResult,
      diseaseName: "Model setup needed",
      status,
      summary: pickString(
        source,
        ["message", "detail"],
        "The scanner backend is online, but the CV model artifact has not been exported yet."
      ),
      recommendation:
        "Train or export the CV model artifact, then retry the scan from this Tanya Padi page.",
      fileName,
    };
  }

  const result = source.result && typeof source.result === "object" ? (source.result as Record<string, unknown>) : {};
  const detection =
    Array.isArray(source.detections) && source.detections[0] && typeof source.detections[0] === "object"
      ? (source.detections[0] as Record<string, unknown>)
      : {};
  const merged = { ...result, ...detection, ...source };
  const rawLabel = pickString(
    merged,
    ["disease_name", "disease", "label", "class_name", "class", "prediction", "predicted_class", "predicted_label", "name"],
    "unknown"
  );
  const confidence = normalizeConfidence(merged.confidence ?? merged.score ?? merged.probability);
  const possibleRisks = Array.isArray(source.top_predictions)
    ? source.top_predictions
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const risk = item as Record<string, unknown>;
          const label = asString(risk.label);
          if (!label || label.toLowerCase() === rawLabel.toLowerCase()) return null;
          const riskConfidence = normalizeConfidence(risk.confidence);
          return `${toTitleCase(label)} (${riskConfidence}%)`;
        })
        .filter((item): item is string => Boolean(item))
        .slice(0, 3)
    : [];

  return {
    diseaseName: toTitleCase(rawLabel),
    confidence,
    status,
    summary: pickString(
      merged,
      ["summary", "description", "analysis", "message", "details"],
      `Backend scan completed for ${fileName}.`
    ),
    recommendation: pickString(
      merged,
      ["recommendation", "recommended_action", "action", "advice"],
      "Review the affected plants in the field and compare nearby leaves before deciding on treatment."
    ),
    possibleRisks,
    fileName,
  };
};

function normalizeKeyword(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim();
}

function getLanguageSearchOrder(lang: Lang): DocumentLanguage[] {
  return lang === "BM" ? ["bm", "en"] : ["en", "bm"];
}

function getResponseLanguageLabel(lang: Lang): string {
  return lang === "BM" ? "Bahasa Malaysia" : "English";
}

async function fetchRagContext(userMessage: string, lang: Lang): Promise<string> {
  try {
    const words = userMessage
      .split(/\s+/)
      .map(normalizeKeyword)
      .filter((word) => word.length > 2);
    if (words.length === 0) return "";

    const searchWords = Array.from(new Set(words)).slice(0, 5);
    const allChunks: string[] = [];
    const languageSearchOrder = getLanguageSearchOrder(lang);

    for (const language of languageSearchOrder) {
      // Execute all Supabase queries for this language in parallel to massively improve response time
      const searchPromises = searchWords.map(word => 
        searchAgricultureDocs({
          keyword: word,
          language,
          limit: 4,
        }).catch(() => [] as string[])
      );
      
      const resultsArray = await Promise.all(searchPromises);
      
      // Flatten the results and filter duplicates
      for (const chunks of resultsArray) {
        for (const chunk of chunks) {
          if (allChunks.length >= 4) break;
          if (!allChunks.includes(chunk)) {
            allChunks.push(chunk);
          }
        }
        if (allChunks.length >= 4) break;
      }

      if (allChunks.length > 0) break;
    }

    return allChunks.join("\n\n");
  } catch {
    return "";
  }
}

async function plannerAgentRoute(text: string): Promise<{
  activeAgents: string[];
  isWhatIf: boolean;
  extractedParams?: {
    days?: number;
    newPrice?: number;
    rainfallIncrease?: number;
  };
}> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return { activeAgents: ["Orchestrator Agent", "Economic Intelligence Agent", "Weather & Disaster Agent", "Yield Forecast Agent", "Crop Health Agent"], isWhatIf: false };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const prompt = `
You are the Planner Agent for SmartPaddy. Analyze the following farmer query and determine:
1. Which specialized agents are needed to answer it.
2. Whether this is a hypothetical "What if" or simulation query (e.g. "what happens if I delay harvest", "what if paddy price drops to RM 150").
3. If it is a "What if" query, extract any numerical parameters mentioned:
   - "days": number of days to delay (e.g., 7 for "delay harvest by a week").
   - "newPrice": specific price in RM mentioned (e.g., 150 for "RM 150").
   - "rainfallIncrease": mm of rainfall mentioned (e.g., 60 for "60mm rain").

Available Agents (return EXACT names):
- "Weather & Disaster Agent": For questions about rain, flood, drought, weather forecasts.
- "Crop Health Agent": For questions about diseases, pests, leaf discoloration, sensors.
- "Economic Intelligence Agent": For questions about market prices, urea, fertilizer, profit.
- "Yield Forecast Agent": For questions about harvest amount, tons per hectare, delay harvest impacts.
- "Orchestrator Agent": For general strategy, overall farm status, or general farming advice.

Return ONLY a JSON object with this exact structure, without any markdown formatting:
{
  "activeAgents": ["agent name 1", "agent name 2"],
  "isWhatIf": true or false,
  "extractedParams": {
    "days": 7,
    "newPrice": 150,
    "rainfallIncrease": 60
  }
}
If a parameter is not mentioned, omit it from extractedParams.

Farmer query: "${text}"
`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const plan = JSON.parse(cleanJson);
    if (!Array.isArray(plan.activeAgents)) plan.activeAgents = ["Orchestrator Agent"];
    return plan;
  } catch (error) {
    console.error("Planner agent failed:", error);
    return { activeAgents: ["Orchestrator Agent", "Economic Intelligence Agent", "Weather & Disaster Agent", "Yield Forecast Agent", "Crop Health Agent"], isWhatIf: false };
  }
}

async function runScenarioSimulation(action: string, farmCtx: FarmContext, extractedParams?: { days?: number; newPrice?: number; rainfallIncrease?: number }) {
  const lowerAction = action.toLowerCase();

  if (!farmCtx.perception || !farmCtx.riskProfile || !farmCtx.yieldEstimate) {
    const fallbackAgents = ["Scenario Simulation Agent"];
    if (lowerAction.includes("price") || lowerAction.includes("rm") || lowerAction.includes("harga")) fallbackAgents.push("Economic Intelligence Agent");
    if (lowerAction.includes("delay") || lowerAction.includes("tunda") || lowerAction.includes("nanti")) fallbackAgents.push("Yield Forecast Agent");
    if (lowerAction.includes("rain") || lowerAction.includes("hujan") || lowerAction.includes("flood")) fallbackAgents.push("Weather & Disaster Agent");

    return { yieldImpact: 0, weatherRisk: 0, profitChange: 0, isRealEngine: false, involvedAgents: fallbackAgents };
  }

  // 1. CLONE the current context to avoid corrupting the main dashboard
  const hypotheticalPerception = JSON.parse(JSON.stringify(farmCtx.perception));
  const hypotheticalFindings = [...farmCtx.findings];
  const hypotheticalRisk = { ...farmCtx.riskProfile };
  let mutationLabel = "Baseline (No Change)";
  const involvedAgents = ["Scenario Simulation Agent"];

  // 2. APPLY MUTATIONS based on user input
  // Case A: Delay Harvest
  if (lowerAction.includes("delay") || lowerAction.includes("tunda") || lowerAction.includes("nanti")) {
    const days = extractedParams?.days ?? (action.match(/\d+/) ? parseInt(action.match(/\d+/)![0]) : 7);
    // Delaying harvest increases exposure to late-season monsoon/pest risk
    hypotheticalRisk.overallRisk = Math.min(100, hypotheticalRisk.overallRisk + (days * 2.5));
    hypotheticalRisk.floodRisk = Math.min(100, hypotheticalRisk.floodRisk + (days * 3));
    mutationLabel = `Delayed harvest by ${days} days (Increased weather exposure)`;
    involvedAgents.push("Yield Forecast Agent");
  }

  // Case B: Paddy Price Change
  if (lowerAction.includes("price") || lowerAction.includes("harga") || lowerAction.includes("rm") || extractedParams?.newPrice !== undefined) {
    const rmMatch = action.match(/rm\s*(\d+(\.\d+)?)/i) || action.match(/(\d+(\.\d+)?)\s*rm/i);
    const newPrice = extractedParams?.newPrice ?? (rmMatch ? parseFloat(rmMatch[1]) : undefined);
    if (newPrice !== undefined) {
      hypotheticalPerception.market.paddyPricePerKgRM = newPrice;
      mutationLabel = `Paddy market price shifted to RM ${newPrice}/kg`;
      if (!involvedAgents.includes("Economic Intelligence Agent")) {
        involvedAgents.push("Economic Intelligence Agent");
      }
    }
  }

  // Case C: Heavy Rainfall / Flood Scenario
  if (lowerAction.includes("rain") || lowerAction.includes("hujan") || lowerAction.includes("flood") || lowerAction.includes("banjir") || extractedParams?.rainfallIncrease !== undefined) {
    const rainIncrease = extractedParams?.rainfallIncrease ?? 60;
    hypotheticalPerception.weather.rainfall_48h_mm += rainIncrease;
    hypotheticalRisk.floodRisk = Math.min(100, hypotheticalRisk.floodRisk + (rainIncrease * 0.6));
    mutationLabel = `Simulating +${rainIncrease}mm extreme rainfall event`;
    involvedAgents.push("Weather & Disaster Agent");
  }

  // 3. RUN THE REAL AGENT with the mutated hypothetical data
  const tree = generateScenarioTree(
    hypotheticalPerception,
    hypotheticalFindings,
    hypotheticalRisk,
    farmCtx.yieldEstimate,
    farmCtx.userGoal
  );

  const best = tree.scenarios.find(s => s.isRecommended) || tree.scenarios[0];
  const yieldDiff = best.projections.yieldTonPerHa.mid - farmCtx.yieldEstimate.adjustedPrediction;

  // Calculate profit delta relative to the main dashboard's recommended strategy
  const currentProfit = farmCtx.scenarioTree?.scenarios.find(s => s.isRecommended)?.projections.profitRM.mid ?? 3000;
  const profitDiff = best.projections.profitRM.mid - currentProfit;

  return {
    yieldImpact: yieldDiff,
    weatherRisk: best.projections.climateRiskScore / 100,
    profitChange: profitDiff,
    isRealEngine: true,
    engineSummary: `HYPOTHETICAL RUN: ${mutationLabel}. Strategy: '${best.name}'. Projection: ${best.projections.yieldTonPerHa.mid} t/ha.`,
    involvedAgents,
  };
}

async function callGemini(
  systemPrompt: string,
  conversationHistory: { role: string; content: string }[],
  fullUserMessage: string,
  onChunk: (text: string) => void
): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured");

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: `SYSTEM INSTRUCTION: ${systemPrompt}` }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. I will act as SmartPaddy and follow those instructions." }],
        },
        ...conversationHistory.map(h => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }],
        })),
      ],
    });

    const result = await chat.sendMessageStream(fullUserMessage);
    let fullText = "";

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onChunk(fullText);
    }

    return fullText;
  } catch (error) {
    console.error("Gemini call failed:", error);
    throw error;
  }
}

export const TanyaPadiChatPanel = ({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) => {
  const { ctx: farmCtx, reportDisease } = useFarmContext();
  const [lang, setLang] = useState<Lang>("BM");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showChips, setShowChips] = useState(true);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [isScanSheetOpen, setIsScanSheetOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [soilMoisture, setSoilMoisture] = useState<number | null>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [lightLux, setLightLux] = useState<number | null>(null);
  const [conversationHistory, setConversationHistory] = useState<{ role: string; content: string }[]>([]);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const handleLangChange = useCallback((nextLang: Lang) => {
    setLang(nextLang);
    setConversationHistory([]);
  }, []);

  // Keep the existing normalized sensor feed so dashboard/prediction behavior stays aligned.
  useEffect(() => {
    const sensorsRef = ref(rtdb, "/sensor_history");
    const unsub = onValue(
      sensorsRef,
      (snapshot) => {
        const sensors = normalizeSensorPayload(snapshot.val() ?? {});
        setSoilMoisture(sensors.soilMoisture);
        setTemp(sensors.temperature);
        setLightLux(sensors.lightIntensity);
      },
      (error) => {
        console.error("Firebase RTDB error:", error);
      }
    );
    return () => unsub();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    return () => {
      if (scanPreviewUrl) URL.revokeObjectURL(scanPreviewUrl);
    };
  }, [scanPreviewUrl]);

  const appendScanMessage = useCallback((result: InlineScanResult, imageUrl?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId.current++,
        role: "assistant",
        text: "",
        lang,
        involvedAgents: ["Crop Health Agent", "Disease Scanner"],
        imageUrl,
        imageAlt: result.fileName ? `Uploaded paddy leaf: ${result.fileName}` : "Uploaded paddy leaf",
        scanResult: result,
      },
    ]);
  }, [lang]);

  const scanLeafImage = useCallback(async (file: File) => {
    setIsScanning(true);
    setScanError(null);

    const previewUrl = URL.createObjectURL(file);
    setScanPreviewUrl(previewUrl);
    let messageImageUrl = previewUrl;

    try {
      const imageBase64 = await fileToDataUrl(file);
      messageImageUrl = imageBase64;
      const response = await fetch("/api/cv/predict", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image_base64: imageBase64 }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errorData = await response.json();
          detail = typeof errorData.detail === "string" ? errorData.detail : "";
        } catch {
          detail = await response.text().catch(() => "");
        }
        throw new Error(detail || `Scan request failed with status ${response.status}.`);
      }

      const payload = await response.json();
      const result = normalizeInlineScanResponse(payload, file.name);
      appendScanMessage(result, imageBase64);

      if (result.confidence > 0 && result.status !== "model_not_ready") {
        reportDisease({
          label: result.diseaseName.toLowerCase(),
          confidence: result.confidence / 100,
          zone: "North Zone",
          source: "Tanya Padi Scanner",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to scan this image.";
      setScanError(message);
      appendScanMessage({
        ...emptyScanResult,
        diseaseName: "Scan unavailable",
        status: "error",
        summary: message,
        recommendation: "Make sure the FastAPI backend is running, then upload the paddy leaf image again.",
        fileName: file.name,
      }, messageImageUrl);
    } finally {
      setIsScanning(false);
    }
  }, [appendScanMessage, reportDisease, scanPreviewUrl]);

  const handleScanFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsScanSheetOpen(false);
    scanLeafImage(file);
    event.target.value = "";
  };

  const openScanSheet = () => {
    if (isScanning) return;
    setScanError(null);
    setIsScanSheetOpen(true);
  };

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMsg: ChatMessage = {
        id: nextId.current++,
        role: "user",
        text: text.trim(),
        lang,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsTyping(true);

      // Build the prompt from live sensors, agent findings, and retrieved agriculture guidance.
      const sensorLine = `[SENSOR DATA: soil_moisture=${soilMoisture ?? "N/A"}%, temperature=${temp ?? "N/A"}°C, light=${lightLux ?? "N/A"} lux]`;
      const ragContext = await fetchRagContext(text, lang);
      const ragLine = ragContext ? `[AGRICULTURAL KNOWLEDGE:\n${ragContext}]` : "";
      const languageLine = `[RESPONSE LANGUAGE: ${getResponseLanguageLabel(lang)}. Reply only in ${getResponseLanguageLabel(lang)}.]`;

      // 1. Detect Intent using Planner Agent
      setActiveAgents(["Planner Agent", AGENT_MESSAGES[lang].routing]);

      const tempMsgId = nextId.current++;
      setMessages((prev) => [...prev, {
        id: tempMsgId,
        role: "assistant",
        text: AGENT_MESSAGES[lang].planning,
        lang,
        involvedAgents: ["Planner Agent"]
      }]);

      const plan = await plannerAgentRoute(text);

      let simulationContext = "";
      const consultedAgents = new Set<string>(plan.activeAgents);

      if (plan.isWhatIf) {
        setActiveAgents(["Scenario Simulation Agent", AGENT_MESSAGES[lang].analyzing]);
        setMessages(prev => prev.map(m => m.id === tempMsgId ? { ...m, text: AGENT_MESSAGES[lang].simulating, involvedAgents: ["Scenario Simulation Agent", AGENT_MESSAGES[lang].analyzing] } : m));

        // 2. Run Simulation: Call the Scenario Simulation Agent
        const sim = await runScenarioSimulation(text, farmCtx, plan.extractedParams);
        sim.involvedAgents.forEach(a => consultedAgents.add(a));
        setActiveAgents(Array.from(consultedAgents)); // Show exactly who is working right now

        simulationContext = `[HYPOTHETICAL SIMULATION RESULT: Action="${text}", Est. Yield Impact=${sim.yieldImpact.toFixed(2)} t/ha, Weather Exposure Risk=${(sim.weatherRisk * 100).toFixed(0)}%, Est. Profit Change=RM ${sim.profitChange}. ${sim.isRealEngine ? sim.engineSummary : "(Fallback)"}]`;
      }

      setMessages((prev) => prev.filter(m => m.id !== tempMsgId));
      setActiveAgents([]);

      // Inject FarmContext intelligence (FILTERED by Planner)
      const agentLines: string[] = [];
      if (farmCtx.findings.length > 0) {
        const relevantFindings = farmCtx.findings.filter(f => 
          f.severity === "critical" || 
          plan.activeAgents.includes(`${f.agentName} Agent`) ||
          plan.activeAgents.includes(f.agentName)
        ).slice(0, 5);

        if (relevantFindings.length > 0) {
          agentLines.push("[AGENT FINDINGS:");
          for (const f of relevantFindings) {
            agentLines.push(`- ${f.agentName} (${f.confidence}%): ${f.finding}. ${f.detail}`);
            const displayAgent = f.agentName.endsWith("Agent") ? f.agentName : `${f.agentName} Agent`;
            consultedAgents.add(displayAgent);
          }
          agentLines.push("]");
        }
      }
      
      if (farmCtx.recommendation && plan.activeAgents.includes("Orchestrator Agent")) {
        agentLines.push(`[RECOMMENDED STRATEGY: ${farmCtx.recommendation.strategyName}. ${farmCtx.recommendation.summary}]`);
        consultedAgents.add("Orchestrator Agent");
      }
      
      if (farmCtx.riskProfile && (plan.activeAgents.includes("Weather & Disaster Agent") || plan.activeAgents.includes("Crop Health Agent") || plan.activeAgents.includes("Economic Intelligence Agent"))) {
        const rp = farmCtx.riskProfile;
        agentLines.push(`[RISK PROFILE: Overall=${rp.overallRisk}%, Flood=${rp.floodRisk}%, Drought=${rp.droughtRisk}%, Disease=${rp.diseaseRisk}%, Market=${rp.marketRisk}%, Trend=${rp.riskTrend}]`);
      }
      
      if (farmCtx.yieldEstimate && plan.activeAgents.includes("Yield Forecast Agent")) {
        const ye = farmCtx.yieldEstimate;
        agentLines.push(`[YIELD ESTIMATE: ${ye.adjustedPrediction} t/ha (range: ${ye.confidenceBand.low}-${ye.confidenceBand.high}), model confidence: ${ye.modelConfidence}%]`);
        consultedAgents.add("Yield Forecast Agent");
      }
      
      if (farmCtx.scenarioTree && farmCtx.scenarioTree.scenarios.length > 0 && plan.activeAgents.includes("Orchestrator Agent")) {
        agentLines.push("[SCENARIO COMPARISON:");
        for (const s of farmCtx.scenarioTree.scenarios) {
          agentLines.push(`- ${s.name}${s.isRecommended ? " (RECOMMENDED)" : ""}: yield=${s.projections.yieldTonPerHa.mid}t/ha, profit=RM${s.projections.profitRM.mid}, risk=${s.projections.climateRiskScore}%, cost=RM${s.projections.operationalCostRM}`);
        }
        agentLines.push("]");
      }

      const agentContext = agentLines.length > 0 ? agentLines.join("\n") : "";

      // 3. Inject Context: Simulation result added to prompt
      const fullUserMessage = `${languageLine}\n\n${sensorLine}\n\n${agentContext}\n\n${simulationContext}\n\n${ragLine}\n\nFarmer's question: ${text.trim()}`;

      let isOffline = false;
      const botMsgId = nextId.current++;

      // Create a temporary message for streaming
      setMessages((prev) => [...prev, {
        id: botMsgId,
        role: "assistant",
        text: "",
        lang,
        involvedAgents: Array.from(consultedAgents)
      }]);

      try {
        // 4 & 5. LLM Call & Stream: Updated system prompt and streaming chunks
        const replyText = await callGemini(
          SYSTEM_PROMPT[lang],
          conversationHistory,
          fullUserMessage,
          (chunk) => {
            // Once streaming starts, we can clear active agents as the "work" is being revealed
            setActiveAgents([]);
            setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: chunk } : m));
          }
        );

        setConversationHistory((prev) =>
          [
            ...prev,
            { role: "user", content: text.trim() },
            { role: "assistant", content: replyText },
          ].slice(-6)
        );
      } catch (err) {
        console.error("Gemini call failed:", err);
        const errorText = lang === "BM"
          ? "Sambungan AI tidak tersedia sekarang, jadi SmartPaddy tidak akan mereka jawapan. Sila cuba lagi sebentar lagi."
          : "The AI connection is unavailable right now, so SmartPaddy will not fabricate an answer. Please try again shortly.";

        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, text: errorText, isOffline: true } : m));
      } finally {
        setIsTyping(false);
      }
    },
    [lang, soilMoisture, temp, lightLux, conversationHistory, farmCtx]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const shellHeightClass = compact ? "h-[min(62vh,560px)] min-h-[420px]" : "h-[calc(100vh-140px)] min-h-[620px]";

  return (
    <>
      <div className={compact ? "h-full" : "mx-auto max-w-3xl"}>
        <section className={`flex ${shellHeightClass} flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-1 ${compact ? "py-2" : "py-3"}`}>
          <div className="flex items-center gap-2.5">
            {compact && (
              <div className="h-10 w-10 overflow-hidden rounded-full border border-primary/10 bg-surface-container-high shadow-sm">
                <img
                  src="/buffalo-avatar.png"
                  alt="Tanya Padi buffalo assistant"
                  className="h-full w-full object-contain p-0.5"
                />
              </div>
            )}
            <h2 className={`font-headline font-bold tracking-wide ${compact ? "text-xl" : "text-2xl"}`}>
              <span className="text-on-tertiary-container">Tanya</span>{" "}
              <span className="text-primary italic">Padi</span>{" "}
              <span>{EMOJI_RICE}</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-surface-container-low rounded-full p-0.5 border border-outline-variant/20">
              <button
                onClick={() => handleLangChange("BM")}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${lang === "BM"
                  ? "bg-primary text-primary-foreground"
                  : "text-on-surface-variant hover:text-primary"
                  }`}
              >
                BM
              </button>
              <button
                onClick={() => handleLangChange("EN")}
                className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${lang === "EN"
                  ? "bg-primary text-primary-foreground"
                  : "text-on-surface-variant hover:text-primary"
                  }`}
              >
                EN
              </button>
            </div>
            {compact && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container-high"
                aria-label="Close Tanya Padi"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-4 px-1 py-4"
        >
          {messages.length === 0 && !isTyping && (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-60 gap-3">
              <span className="text-5xl">{EMOJI_RICE}</span>
              <p className="text-sm text-on-surface-variant">
                {lang === "BM"
                  ? "Selamat datang! Tanya saya apa-apa tentang penanaman padi."
                  : "Welcome! Ask me anything about paddy farming."}
              </p>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-sm bg-primary text-primary-foreground text-sm leading-relaxed">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex gap-2.5 items-start">
                <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 overflow-hidden border border-primary/10 shadow-sm">
                  <img
                    src="/buffalo-avatar.png"
                    alt="SmartPaddy buffalo assistant"
                    className="h-full w-full object-contain p-0.5"
                  />
                </div>
                <div className="max-w-[80%]">
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-surface-container-lowest text-on-surface text-sm leading-relaxed shadow-sm border border-outline-variant/10">
                    {msg.isOffline && (
                      <span className="text-xs text-outline mb-1 block">{WARNING_LABEL}</span>
                    )}
                    {msg.involvedAgents && msg.involvedAgents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-outline-variant/10">
                        {msg.involvedAgents.map(agent => (
                          <div key={agent} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary/10 border border-tertiary/20 text-[9px] font-bold text-tertiary uppercase tracking-tight">
                            <span className="w-1 h-1 rounded-full bg-tertiary" />
                            {agent}
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.imageUrl && (
                      <div className="mb-3 overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container-low">
                        <img
                          src={msg.imageUrl}
                          alt={msg.imageAlt ?? "Uploaded paddy leaf"}
                          className="max-h-56 w-full object-contain bg-black/5"
                        />
                      </div>
                    )}
                    {msg.scanResult ? (
                      <div className="space-y-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary/70">
                            Leaf Scan Result
                          </p>
                          <h3 className="mt-1 text-xl font-bold leading-tight text-primary">
                            {msg.scanResult.diseaseName}
                          </h3>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {msg.scanResult.fileName || "Uploaded paddy leaf"}
                          </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                              Confidence
                            </p>
                            <p className="mt-1 text-2xl font-bold text-primary">
                              {msg.scanResult.confidence > 0 ? `${msg.scanResult.confidence}%` : "Not available"}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                              Status
                            </p>
                            <p className="mt-1 text-sm font-semibold capitalize text-on-surface">
                              {msg.scanResult.status.replace(/_/g, " ")}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-outline-variant/15 bg-white/70 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                            Summary
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-on-surface">
                            {msg.scanResult.summary}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                            Recommended Action
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-on-surface">
                            {msg.scanResult.recommendation}
                          </p>
                        </div>

                        {msg.scanResult.possibleRisks.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-outline">
                              Other Possible Risks
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.scanResult.possibleRisks.map((risk) => (
                                <span
                                  key={risk}
                                  className="rounded-full border border-outline-variant/20 bg-surface-container-low px-3 py-1 text-xs font-semibold text-primary"
                                >
                                  {risk}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-outline mt-1 inline-block ml-1 uppercase font-label font-medium tracking-wider">
                    {msg.lang}
                  </span>
                </div>
              </div>
            )
          )}

          {/* Typing indicator & Active Agents */}
          {(isTyping || activeAgents.length > 0) && (
            <div className="flex gap-2.5 items-start">
              <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 overflow-hidden border border-primary/10 shadow-sm">
                <img
                  src="/buffalo-avatar.png"
                  alt="SmartPaddy buffalo assistant"
                  className="h-full w-full object-contain p-0.5"
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-surface-container-lowest border border-outline-variant/10 shadow-sm w-fit">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>

                {activeAgents.length > 0 && (
                  <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                    {activeAgents.map(agent => (
                      <div key={agent} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-tertiary/10 border border-tertiary/20 text-[10px] font-bold text-tertiary uppercase tracking-tight">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
                        {agent}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Agent context bar */}
        {farmCtx.recommendation && (
          <div className="px-3 py-2 bg-primary/5 border border-primary/10 rounded-xl mx-1 mb-1 flex items-center gap-2 text-xs text-primary font-medium">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
            <span className="truncate">Strategy: {farmCtx.recommendation.strategyName}</span>
            {farmCtx.riskProfile && (
              <>
                <span className="text-primary/30">·</span>
                <span>Risk: {farmCtx.riskProfile.overallRisk}%</span>
              </>
            )}
            {farmCtx.yieldEstimate && (
              <>
                <span className="text-primary/30">·</span>
                <span>Yield: {farmCtx.yieldEstimate.adjustedPrediction} t/ha</span>
              </>
            )}
          </div>
        )}

        {/* Sensor context bar */}
        <div className="px-3 py-2 bg-surface-container-low rounded-xl mx-1 mb-2 flex items-center justify-center gap-4 text-xs text-on-surface-variant font-medium">
          <span>{EMOJI_DROPLET} {soilMoisture ?? "--"}%</span>
          <span className="text-outline-variant/40">|</span>
          <span>{EMOJI_THERMOMETER} {temp ?? "--"}°C</span>
          <span className="text-outline-variant/40">|</span>
          <span>{EMOJI_SUN} {lightLux ?? "--"} lux</span>
        </div>

        {/* Quick reply chips */}
        {showChips && (
          <div className="flex gap-2 px-1 mb-2 overflow-x-auto">
            {QUICK_REPLIES[lang].map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                className="whitespace-nowrap px-3 py-2 rounded-full border border-outline-variant/30 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high active:scale-95 transition-all"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 px-1 pb-1">
          <input
            className="min-w-0 flex-1 bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-sm placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            placeholder={PLACEHOLDERS[lang]}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={openScanSheet}
                disabled={isScanning}
                className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-primary/15 bg-surface-container-low px-3 text-xs font-bold text-primary transition-all hover:bg-primary/10 active:scale-95 disabled:opacity-60 sm:px-4"
                aria-label="Scan paddy leaf for disease classification"
              >
                {isScanning ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                    <span className="hidden sm:inline">Scanning</span>
                  </>
                ) : (
                  <>
                    <span className="hidden sm:inline">Scan Leaf</span>
                    <span className="text-base" aria-hidden="true">{"\u{1F33F}"}</span>
                  </>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-xs leading-relaxed">
              Scan a paddy leaf photo for disease classification and add the result to the crop-health agent.
            </TooltipContent>
          </Tooltip>
          <button
            type="submit"
            disabled={isTyping || !input.trim()}
            className="bg-primary text-primary-foreground w-11 h-11 shrink-0 rounded-xl flex items-center justify-center transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              send
            </span>
          </button>
        </form>
        </section>
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleScanFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleScanFileChange}
      />

      {isScanSheetOpen && (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/35 px-4 pb-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close scan sheet"
            onClick={() => setIsScanSheetOpen(false)}
          />
          <section className="relative w-full max-w-md rounded-t-[2rem] rounded-b-3xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-outline-variant/50" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Paddy Disease Scanner</p>
                <h3 className="mt-1 font-headline text-2xl font-bold text-primary">Scan Paddy Leaf</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  Upload or capture a clear paddy leaf photo for disease classification. Tanya Padi will return the likely class, confidence, and next field action.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScanSheetOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container-high"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {scanPreviewUrl && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low">
                <img src={scanPreviewUrl} alt="Latest uploaded paddy leaf" className="h-32 w-full object-contain bg-black/5 p-2" />
              </div>
            )}

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={isScanning}
                className="flex items-center gap-4 rounded-2xl border border-outline-variant/20 bg-white px-4 py-4 text-left shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98] disabled:opacity-60"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <span className="material-symbols-outlined">photo_library</span>
                </span>
                <span>
                  <span className="block text-sm font-bold text-primary">Upload Photo</span>
                  <span className="block text-xs text-on-surface-variant">Select an existing paddy leaf image.</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isScanning}
                className="flex items-center gap-4 rounded-2xl border border-outline-variant/20 bg-white px-4 py-4 text-left shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98] disabled:opacity-60"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <span className="material-symbols-outlined">photo_camera</span>
                </span>
                <span>
                  <span className="block text-sm font-bold text-primary">Open Camera</span>
                  <span className="block text-xs text-on-surface-variant">Take a fresh field photo of the leaf.</span>
                </span>
              </button>
            </div>

            {isScanning && (
              <p className="mt-4 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                Running backend disease scan...
              </p>
            )}
            {scanError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {scanError}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
};

const ChatPage = () => <TanyaPadiChatPanel />;

export default ChatPage;



