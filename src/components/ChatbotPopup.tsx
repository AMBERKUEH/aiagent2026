import { useState, useRef, useEffect, useCallback } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";
import ReactMarkdown from "react-markdown";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

interface ChatbotPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFullChat: () => void;
}

interface MiniMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
}

const QUICK_ASKS = (t: (k: string) => string) => [
  t("quick_advice"),
  // Keep a few example asks that are language-neutral or short
  t("quick_advice"),
  t("quick_advice"),
];

export default function ChatbotPopup({ isOpen, onClose, onOpenFullChat }: ChatbotPopupProps) {
  const { ctx: farmCtx } = useFarmContext();
  const [messages, setMessages] = useState<MiniMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const { t } = useLanguage();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;

      const userMsg: MiniMessage = { id: nextId.current++, role: "user", text: text.trim() };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsTyping(true);

      const botMsgId = nextId.current++;
      setMessages((prev) => [...prev, { id: botMsgId, role: "assistant", text: "" }]);

      try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("No API key");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        // Build context
        const contextParts: string[] = [
          "You are SmartPaddy, a quick-response farming advisor. Keep answers under 3 sentences. Be direct and actionable.",
        ];

        if (farmCtx.recommendation) {
          contextParts.push(`Current strategy: ${farmCtx.recommendation.strategyName}. ${farmCtx.recommendation.summary}`);
        }
        if (farmCtx.riskProfile) {
          contextParts.push(`Risk: Overall=${farmCtx.riskProfile.overallRisk}%, Flood=${farmCtx.riskProfile.floodRisk}%, Disease=${farmCtx.riskProfile.diseaseRisk}%`);
        }

        const result = await model.generateContent(`${contextParts.join("\n")}\n\nFarmer asks: ${text.trim()}`);
        const reply = result.response.text();

        setMessages((prev) => prev.map((m) => (m.id === botMsgId ? { ...m, text: reply } : m)));
      } catch {
        setMessages((prev) =>
          prev.map((m) => (m.id === botMsgId ? { ...m, text: "Connection unavailable. Try the full chat page." } : m))
        );
      } finally {
        setIsTyping(false);
      }
    },
    [isTyping, farmCtx]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* FAB Button is rendered by parent (AppLayout) */}

      {/* Popup */}
      <div
        className={`fixed bottom-20 right-4 z-[1999] w-[320px] max-w-[calc(100vw-2rem)] rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col overflow-hidden transition-all duration-300 ease-out ${
          isOpen
            ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-95 translate-y-4 pointer-events-none"
        }`}
        style={{ maxHeight: "min(460px, 60vh)" }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                smart_toy
              </span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">{t("ask_smartpaddy")}</h3>
              <p className="text-[9px] text-slate-400">{t("quick_advice")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenFullChat}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
              title={t("open_full_chat")}
            >
              <span className="material-symbols-outlined text-slate-400 text-sm">open_in_full</span>
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <span className="material-symbols-outlined text-slate-400 text-sm">close</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[120px]">
          {messages.length === 0 && !isTyping && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <span className="text-3xl mb-2">🌾</span>
              <p className="text-[11px] text-slate-400">{t("ask_placeholder")}</p>
            </div>
          )}

          {messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-br-sm bg-primary text-white text-xs leading-relaxed">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex gap-2 items-start">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px]">🌿</span>
                </div>
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm bg-slate-50 text-xs leading-relaxed text-slate-700 border border-slate-100">
                  {msg.text ? (
                    <div className="prose prose-xs max-w-none prose-p:my-0.5">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex gap-1 items-center h-4">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Quick suggestions */}
        {messages.length === 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1.5">
            {QUICK_ASKS(t).map((q, i) => (
              <button
                key={`${q}-${i}`}
                onClick={() => sendMessage(q)}
                className="px-2.5 py-1.5 rounded-full border border-slate-200 text-[10px] font-medium text-slate-500 hover:bg-slate-50 hover:text-primary hover:border-primary/30 transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-center text-[8px] text-slate-300 pb-1">{t("disclaimer")}</p>

        {/* Input */}
        <form onSubmit={handleSubmit} className="px-3 pb-3 flex items-center gap-2">
          <input
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
            placeholder={t("ask_placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={isTyping || !input.trim()}
            className="bg-primary text-white w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              send
            </span>
          </button>
        </form>
      </div>
    </>
  );
}
