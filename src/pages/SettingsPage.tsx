// ============================================================
// Settings Page
// ============================================================
// Shows farmer info, paddy field summary, and logout.
// Redesigned to match the SmartPaddy reference design.
// ============================================================

import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

function LanguageSelector() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-slate-500 text-sm">translate</span>
        </div>
        <span className="text-sm text-slate-700 font-medium">{t("language")}</span>
      </div>
      <div className="flex items-center bg-slate-100 rounded-full p-0.5">
        <button
          onClick={() => setLang("BM")}
          className={`px-3 py-1 text-xs font-bold rounded-full ${lang === "BM" ? "bg-primary text-white" : "text-slate-500"}`}
        >
          BM
        </button>
        <button
          onClick={() => setLang("EN")}
          className={`px-3 py-1 text-xs font-bold rounded-full ${lang === "EN" ? "bg-primary text-white" : "text-slate-500"}`}
        >
          EN
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { ctx, hasLiveSensors, lastCycleTime } = useFarmContext();
  const { lang, setLang, t } = useLanguage();

  const userName = user?.email?.split("@")[0]?.replace(/[._]/g, " ") ?? "Farmer";
  const displayName = userName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <AppLayout>
      <div className="mx-auto max-w-lg space-y-5 pb-8 pt-2">
        {/* Page Header */}
        <div className="text-center">
          <h1 className="font-headline text-xl font-bold text-slate-900">{t("settings")}</h1>
          <p className="text-xs text-slate-400 mt-1">{t("manage_preferences")}</p>
        </div>

        {/* ── Farmer Info ─────────────────────────────────────── */}
        <section className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary uppercase">
                {user?.email?.charAt(0) ?? "F"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-headline text-lg font-bold text-slate-900 truncate">{displayName}</h2>
              <p className="text-xs text-slate-500 truncate">{user?.email ?? "farmer@smartpaddy.my"}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="material-symbols-outlined text-xs text-slate-400">location_on</span>
                <span className="text-[11px] text-slate-400">Kedah, Malaysia</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Paddy Info Summary ──────────────────────────────── */}
        <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-primary">grass</span>
            Paddy Field Summary
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Farm ID</p>
              <p className="text-sm font-bold text-slate-800">{ctx.farmId}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Sensor Feed</p>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${hasLiveSensors ? "bg-emerald-500 animate-pulse" : "bg-amber-400"}`} />
                <p className={`text-sm font-bold ${hasLiveSensors ? "text-emerald-700" : "text-amber-700"}`}>
                  {hasLiveSensors ? "Connected" : "Waiting"}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">AI Phase</p>
              <p className="text-sm font-bold capitalize text-slate-800">{ctx.phase}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Last Cycle</p>
              <p className="text-sm font-bold text-slate-800">
                {lastCycleTime === null ? "Not run" : `${(lastCycleTime / 1000).toFixed(1)}s`}
              </p>
            </div>
          </div>

          {/* Risk summary if available */}
          {ctx.riskProfile && (
            <div className="mt-4 rounded-2xl bg-primary/5 border border-primary/10 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-sm text-primary">shield</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Current Risk Profile</span>
              </div>
              <div className="flex gap-3 text-center">
                {[
                  { label: "Overall", value: ctx.riskProfile.overallRisk },
                  { label: "Flood", value: ctx.riskProfile.floodRisk },
                  { label: "Disease", value: ctx.riskProfile.diseaseRisk },
                ].map(r => (
                  <div key={r.label} className="flex-1">
                    <p className="font-headline text-lg font-bold text-slate-900">{r.value}%</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">{r.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Preferences ─────────────────────────────────────── */}
        <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-primary">tune</span>
            {t("preferences")}
          </h3>
          <div className="space-y-3">
            <LanguageSelector />
            <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-slate-500 text-sm">notifications</span>
                  </div>
                  <span className="text-sm text-slate-700 font-medium">{t("notifications")}</span>
                </div>
              <div className="w-10 h-6 bg-primary rounded-full flex items-center px-0.5 cursor-pointer">
                <div className="w-5 h-5 bg-white rounded-full shadow-sm ml-auto" />
              </div>
            </div>
          </div>
        </section>

        {/* ── Logout ──────────────────────────────────────────── */}
        <button
          onClick={() => logout()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800 active:scale-[0.98] shadow-lg"
        >
          <span className="material-symbols-outlined text-base">logout</span>
          {t("sign_out")}
        </button>

        <p className="text-center text-[10px] text-slate-300">{t("built_for")}</p>
      </div>
    </AppLayout>
  );
}
