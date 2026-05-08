import AppLayout from "@/components/AppLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { rtdb } from "@/lib/firebase";
import { normalizeSensorPayload } from "@/lib/sensors";
import { searchAgricultureDocs } from "@/lib/supabase";
import { ref, onValue } from "firebase/database";
import ReactMarkdown from "react-markdown";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";

type Lang = "BM" | "EN";
type DocumentLanguage = "bm" | "en";
const EMOJI_RICE = "\u{1F33E}";
const EMOJI_HERB = "\u{1F33F}";
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
}

const SYSTEM_PROMPT: Record<Lang, string> = {
  BM: "You are SmartPaddy, an AI farming advisory agent for Malaysian B40 paddy farmers. Always respond in Bahasa Malaysia. Keep answers short, practical, and simple. You will receive: (1) live sensor readings, (2) agent findings from our multi-agent system (weather, crop health, yield, market agents), (3) the current recommended strategy and scenario comparison. Use ALL of this context to give highly specific, actionable advice. When farmers ask 'why', explain the reasoning chain from our agents. Only answer about paddy farming and Malaysian agriculture. End every response with one clear action.",
  EN: "You are SmartPaddy, an AI farming advisory agent for Malaysian paddy farmers. Always respond in English. Keep answers short, practical, and actionable. You will receive: (1) live sensor readings, (2) agent findings from our multi-agent system (weather, crop health, yield, market agents), (3) the current recommended strategy and scenario comparison. Use ALL of this context to give highly specific, data-driven advice. When farmers ask 'why', trace the reasoning back through agent findings. Only answer about paddy farming and Malaysian agriculture. End every response with one clear recommended action.",
};

const QUICK_REPLIES: Record<Lang, string[]> = {
  BM: ["Kenapa strategi ini disyorkan?", "Bila nak siram padi?", "Apakah risiko banjir sekarang?", "Harga baja urea?"],
  EN: ["Why is this strategy recommended?", "When should I irrigate?", "What is the current flood risk?", "Explain the yield forecast"],
};

const PLACEHOLDERS: Record<Lang, string> = {
  BM: "Tanya soalan pertanian...",
  EN: "Ask a farming question...",
};

function getFallback(msg: string, lang: Lang): string {
  const lower = msg.toLowerCase();
  if (/siram|irrigat|moisture|lembap/.test(lower)) {
    return lang === "BM"
      ? "Berdasarkan kelembapan tanah anda, siram padi jika kelembapan di bawah 40%. Pastikan air mencukupi pada peringkat pembungaan."
      : "Based on your soil moisture, irrigate if reading drops below 40%. Ensure adequate water during flowering stage.";
  }
  if (/kuning|yellow|daun|leaf/.test(lower)) {
    return lang === "BM"
      ? "Daun kuning biasanya menunjukkan kekurangan nitrogen. Cuba tambah baja Urea dan pastikan pH tanah antara 5.5-6.5."
      : "Yellow leaves usually indicate nitrogen deficiency. Try adding Urea fertiliser and check soil pH is between 5.5-6.5.";
  }
  if (/baja|urea|fertiliser|npk/.test(lower)) {
    return lang === "BM"
      ? "Harga baja semasa: Urea RM1.60/kg (subsidi), NPK Blue RM2.20/kg (subsidi). Beli di kedai baja berlesen FAMA."
      : "Current fertiliser prices: Urea RM1.60/kg (subsidised), NPK Blue RM2.20/kg (subsidised). Buy from FAMA-licensed retailers.";
  }
  return lang === "BM"
    ? "Maaf, saya tidak dapat menjawab soalan anda sekarang. Sila cuba lagi atau hubungi pegawai pertanian MARDI di kawasan anda."
    : "Sorry, I'm unable to answer right now. Please try again or contact your local MARDI agriculture officer.";
}

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
      for (const word of searchWords) {
        if (allChunks.length >= 4) break;
        try {
          const chunks = await searchAgricultureDocs({
            keyword: word,
            language,
            limit: 4,
          });

          for (const chunk of chunks) {
            if (allChunks.length >= 4) break;
            if (!allChunks.includes(chunk)) {
              allChunks.push(chunk);
            }
          }
        } catch {
          // Skip individual query errors so chat can still respond.
        }
      }

      if (allChunks.length > 0) break;
    }

    return allChunks.join("\n\n");
  } catch {
    return "";
  }
}

async function callGroq(
  systemPrompt: string,
  conversationHistory: { role: string; content: string }[],
  fullUserMessage: string
): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("Groq API key not configured");

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: "user", content: fullUserMessage },
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 350,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

const ChatPage = () => {
  const { ctx: farmCtx } = useFarmContext();
  const [lang, setLang] = useState<Lang>("BM");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showChips, setShowChips] = useState(true);
  const [soilMoisture, setSoilMoisture] = useState<number | null>(null);
  const [temp, setTemp] = useState<number | null>(null);
  const [lightLux, setLightLux] = useState<number | null>(null);
  const [conversationHistory, setConversationHistory] = useState<{ role: string; content: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setShowChips(false);

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

      // Inject FarmContext intelligence
      const agentLines: string[] = [];
      if (farmCtx.findings.length > 0) {
        const topFindings = farmCtx.findings.filter(f => f.severity !== "positive").slice(0, 5);
        if (topFindings.length > 0) {
          agentLines.push("[AGENT FINDINGS:");
          for (const f of topFindings) {
            agentLines.push(`- ${f.agentName} (${f.confidence}%): ${f.finding}. ${f.detail}`);
          }
          agentLines.push("]");
        }
      }
      if (farmCtx.recommendation) {
        agentLines.push(`[RECOMMENDED STRATEGY: ${farmCtx.recommendation.strategyName}. ${farmCtx.recommendation.summary}]`);
      }
      if (farmCtx.riskProfile) {
        const rp = farmCtx.riskProfile;
        agentLines.push(`[RISK PROFILE: Overall=${rp.overallRisk}%, Flood=${rp.floodRisk}%, Drought=${rp.droughtRisk}%, Disease=${rp.diseaseRisk}%, Market=${rp.marketRisk}%, Trend=${rp.riskTrend}]`);
      }
      if (farmCtx.yieldEstimate) {
        const ye = farmCtx.yieldEstimate;
        agentLines.push(`[YIELD ESTIMATE: ${ye.adjustedPrediction} t/ha (range: ${ye.confidenceBand.low}-${ye.confidenceBand.high}), model confidence: ${ye.modelConfidence}%]`);
      }
      if (farmCtx.scenarioTree && farmCtx.scenarioTree.scenarios.length > 0) {
        agentLines.push("[SCENARIO COMPARISON:");
        for (const s of farmCtx.scenarioTree.scenarios) {
          agentLines.push(`- ${s.name}${s.isRecommended ? " (RECOMMENDED)" : ""}: yield=${s.projections.yieldTonPerHa.mid}t/ha, profit=RM${s.projections.profitRM.mid}, risk=${s.projections.climateRiskScore}%, cost=RM${s.projections.operationalCostRM}`);
        }
        agentLines.push("]");
      }

      const agentContext = agentLines.length > 0 ? agentLines.join("\n") : "";
      const fullUserMessage = `${languageLine}\n\n${sensorLine}\n\n${agentContext}\n\n${ragLine}\n\nFarmer's question: ${text.trim()}`;

      let replyText: string;
      let isOffline = false;

      try {
        replyText = await callGroq(SYSTEM_PROMPT[lang], conversationHistory, fullUserMessage);
      } catch (err) {
        console.error("Groq call failed, using fallback:", err);
        replyText = getFallback(text, lang);
        isOffline = true;
      }

      const botMsg: ChatMessage = {
        id: nextId.current++,
        role: "assistant",
        text: replyText,
        lang,
        isOffline,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);

      // Update conversation history (raw messages only, max 6)
      setConversationHistory((prev) =>
        [
          ...prev,
          { role: "user", content: text.trim() },
          { role: "assistant", content: replyText },
        ].slice(-6)
      );
    },
    [lang, soilMoisture, temp, lightLux, conversationHistory, farmCtx]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-140px)] max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between py-3 px-1">
          <h2 className="font-headline text-2xl font-bold tracking-wide">
            <span className="text-on-tertiary-container">Tanya</span>{" "}
            <span className="text-primary italic">SmartPaddy</span>{" "}
            <span>{EMOJI_RICE}</span>
          </h2>
          <div className="flex items-center bg-surface-container-low rounded-full p-0.5 border border-outline-variant/20">
            <button
              onClick={() => handleLangChange("BM")}
              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
                lang === "BM"
                  ? "bg-primary text-primary-foreground"
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              BM
            </button>
            <button
              onClick={() => handleLangChange("EN")}
              className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all ${
                lang === "EN"
                  ? "bg-primary text-primary-foreground"
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              EN
            </button>
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
                <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 text-lg">
                  {EMOJI_HERB}
                </div>
                <div className="max-w-[80%]">
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-surface-container-lowest text-on-surface text-sm leading-relaxed shadow-sm border border-outline-variant/10">
                    {msg.isOffline && (
                      <span className="text-xs text-outline mb-1 block">{WARNING_LABEL}</span>
                    )}
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                  <span className="text-[10px] text-outline mt-1 inline-block ml-1 uppercase font-label font-medium tracking-wider">
                    {msg.lang}
                  </span>
                </div>
              </div>
            )
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex gap-2.5 items-start">
              <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0 text-lg">
                  {EMOJI_HERB}
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-surface-container-lowest border border-outline-variant/10 shadow-sm">
                <div className="flex gap-1 items-center h-5">
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
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
            className="flex-1 bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-sm placeholder:text-outline/50 focus:outline-none focus:ring-1 focus:ring-primary transition-all"
            placeholder={PLACEHOLDERS[lang]}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={isTyping || !input.trim()}
            className="bg-primary text-primary-foreground w-11 h-11 rounded-xl flex items-center justify-center transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              send
            </span>
          </button>
        </form>
      </div>
    </AppLayout>
  );
};

export default ChatPage;
