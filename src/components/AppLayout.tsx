import { ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import SidebarNav from "./SidebarNav";
import AgentPanel from "./AgentPanel";
import ChatbotPopup from "./ChatbotPopup";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import BottomNav from "./BottomNav";
import { TanyaPadiChatPanel } from "@/pages/ChatPage";

const TanyaPadiLauncher = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-20 right-3 z-[1100] w-[min(calc(100vw-1.5rem),440px)] max-h-[calc(100vh-6rem)] overflow-hidden rounded-3xl border border-outline-variant/20 bg-surface p-4 shadow-2xl sm:bottom-20 sm:right-5">
          <TanyaPadiChatPanel compact onClose={() => setIsOpen(false)} />
        </div>
      )}

      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[4.65rem] right-5 z-[1100] flex h-16 w-16 items-center justify-center rounded-full border border-primary/15 bg-surface-container-lowest p-1.5 text-primary shadow-2xl transition-all hover:-translate-y-0.5 hover:bg-primary/5 active:scale-95 sm:right-6"
          aria-label="Open Tanya Padi chat"
        >
          <span className="h-full w-full overflow-hidden rounded-full bg-surface-container-high">
            <img src="/buffalo-avatar.png" alt="" className="h-full w-full object-contain p-0.5" />
          </span>
        </button>
      )}
    </>
  );
};

const AppLayout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [chatPopupOpen, setChatPopupOpen] = useState(false);

  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Top Bar ───────────────────────────────────────── */}
      <header className="fixed top-0 w-full z-[1001] bg-white/80 backdrop-blur-xl border-b border-slate-100/60 flex justify-between items-center px-4 py-3">
        {/* Left: Hamburger */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors active:scale-95"
          id="hamburger-menu-btn"
        >
          <span className="material-symbols-outlined text-slate-700">menu</span>
        </button>

        {/* Center: Title */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
              agriculture
            </span>
          </div>
          <h1 className="text-base font-bold text-primary font-headline tracking-wide">{t("smartpaddy_name")}</h1>
        </div>

        {/* Right: Agent Panel Arrow + Settings Gear */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAgentPanelOpen(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors active:scale-95 relative"
            id="agent-panel-btn"
            title={t("ask_smartpaddy")}
          >
            <span className="material-symbols-outlined text-slate-700">chevron_left</span>
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors active:scale-95"
            id="settings-btn"
            title={t("settings")}
          >
            <span className="material-symbols-outlined text-slate-700">settings</span>
          </button>
        </div>
      </header>

      {/* ── Sidebar Navigation ────────────────────────────── */}
      <SidebarNav isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── Agent Panel (Right) ───────────────────────────── */}
      <AgentPanel isOpen={agentPanelOpen} onClose={() => setAgentPanelOpen(false)} />

      {/* ── Main Content ──────────────────────────────────── */}
      <main className="pt-16 pb-8 px-4 sm:px-6">
        {children}
      </main>

      {/* ── Floating Chatbot FAB ──────────────────────────── */}
      <button
        onClick={() => setChatPopupOpen((prev) => !prev)}
        className={`fixed bottom-6 right-4 z-[1998] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 active:scale-90 ${
          chatPopupOpen
            ? "bg-slate-700 rotate-0"
            : "bg-primary hover:shadow-primary/30 hover:scale-105"
        }`}
        id="chatbot-fab-btn"
        title={t("ask_smartpaddy")}
      >
        <span className="material-symbols-outlined text-white text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
          {chatPopupOpen ? "close" : "forum"}
        </span>
      </button>

      {/* ── Chatbot Popup ─────────────────────────────────── */}
      <ChatbotPopup
        isOpen={chatPopupOpen}
        onClose={() => setChatPopupOpen(false)}
        onOpenFullChat={() => {
          setChatPopupOpen(false);
          navigate("/chat");
        }}
      />

      <BottomNav />
      <TanyaPadiLauncher />
    </div>
  );
};

export default AppLayout;
