import { ReactNode } from "react";
import AppHeader from "./AppHeader";
import BottomNav from "./BottomNav";

const AppLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="pt-20 pb-28 px-6">
        {children}
      </main>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
