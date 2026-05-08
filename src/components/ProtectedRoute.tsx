import { useAuth } from "@/lib/auth/AuthProvider";
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isAuthLoading } = useAuth();
  const location = useLocation();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="material-symbols-outlined text-3xl text-primary animate-pulse">lock_open</span>
          <p className="mt-2 text-sm font-medium text-slate-600">Checking your farm session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
