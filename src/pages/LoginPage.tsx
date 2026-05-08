import { useAuth, type AuthMode } from "@/lib/auth/AuthProvider";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

type LocationState = {
  from?: { pathname?: string };
};

const friendlyAuthError = (message: string) => {
  if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) {
    return "The email or password does not match. Please try again.";
  }
  if (message.includes("auth/email-already-in-use")) {
    return "This email already has a SmartPaddy account. Sign in instead.";
  }
  if (message.includes("auth/weak-password")) {
    return "Use at least 6 characters for the password.";
  }
  if (message.includes("auth/invalid-email")) {
    return "Please enter a valid email address.";
  }
  return "Login is temporarily unavailable. Please check your connection and Firebase Auth setup.";
};

export default function LoginPage() {
  const { user, isAuthLoading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const redirectTo = state?.from?.pathname ?? "/";

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(redirectTo, { replace: true });
    }
  }, [navigate, redirectTo, user]);

  if (!isAuthLoading && user) {
    return <Navigate to={redirectTo} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || password.length < 6) {
      setError("Enter your email and a password with at least 6 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      navigate(redirectTo, { replace: true });
    } catch (authError) {
      setError(friendlyAuthError(authError instanceof Error ? authError.message : ""));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-50 px-5 py-8 flex items-center justify-center">
      <main className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-2xl">agriculture</span>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">SmartPaddy MY</p>
          <h1 className="mt-2 font-headline text-3xl font-bold text-slate-900">Welcome, farmer</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in to see your live farm dashboard and decision intelligence.</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "signin" ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "signup" ? "bg-white text-primary shadow-sm" : "text-slate-500"}`}
            >
              New account
            </button>
          </div>

          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="farmer@example.com"
            autoComplete="email"
            className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />

          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />

          {error && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isAuthLoading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition hover:opacity-90 disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-base ${isSubmitting ? "animate-spin" : ""}`}>
              {isSubmitting ? "refresh" : "login"}
            </span>
            {mode === "signin" ? "Enter Dashboard" : "Create Farm Account"}
          </button>
        </form>
      </main>
    </div>
  );
}
