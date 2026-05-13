import { ReactNode, useState } from "react";
import AppHeader from "./AppHeader";
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
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="pt-20 pb-28 px-6">
        {children}
      </main>
      <BottomNav />
      <TanyaPadiLauncher />
    </div>
  );
};

export default AppLayout;
