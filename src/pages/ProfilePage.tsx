import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useFarmContext } from "@/lib/agents/FarmContextProvider";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { ctx, hasLiveSensors, lastCycleTime } = useFarmContext();

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-5 pb-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
              <span className="material-symbols-outlined text-2xl">person</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Farmer Profile</p>
              <h1 className="mt-1 truncate font-headline text-2xl font-bold text-slate-900">
                {user?.email ?? "SmartPaddy farmer"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">Farm ID: {ctx.farmId}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sensor Feed</p>
            <p className={`mt-2 text-sm font-semibold ${hasLiveSensors ? "text-emerald-700" : "text-amber-700"}`}>
              {hasLiveSensors ? "Connected" : "Waiting"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Agent Phase</p>
            <p className="mt-2 text-sm font-semibold capitalize text-slate-800">{ctx.phase}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last Cycle</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {lastCycleTime === null ? "Not run" : `${(lastCycleTime / 1000).toFixed(1)}s`}
            </p>
          </div>
        </section>

        <button
          onClick={() => logout()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
        >
          <span className="material-symbols-outlined text-base">logout</span>
          Sign Out
        </button>
      </div>
    </AppLayout>
  );
}
