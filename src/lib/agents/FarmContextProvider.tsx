// ============================================================
// FarmContext React Provider
// ============================================================
// Global state provider that connects the Orchestrator to React.
// Any component can access the current farm context, trigger
// new agent cycles, and update the user's goal.
// ============================================================

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { rtdb } from "@/lib/firebase";
import { normalizeSensorPayload } from "@/lib/sensors";
import { ref, onValue } from "firebase/database";
import { getOrchestrator, type Orchestrator } from "./orchestrator";
import type { FarmContext, UserGoal, DiseaseResult } from "./types";
import { createEmptyFarmContext, DEFAULT_USER_GOAL } from "./types";

interface FarmContextValue {
  ctx: FarmContext;
  isRunning: boolean;
  runCycle: (goal?: UserGoal) => Promise<void>;
  setGoal: (goal: UserGoal) => void;
  reportDisease: (disease: DiseaseResult) => void;
  lastCycleTime: number | null; // ms duration of last cycle
}

const FarmCtx = createContext<FarmContextValue>({
  ctx: createEmptyFarmContext(),
  isRunning: false,
  runCycle: async () => {},
  setGoal: () => {},
  reportDisease: () => {},
  lastCycleTime: null,
});

export function useFarmContext(): FarmContextValue {
  return useContext(FarmCtx);
}

export function FarmContextProvider({ children }: { children: ReactNode }) {
  const orchestratorRef = useRef<Orchestrator>(getOrchestrator());
  const [ctx, setCtx] = useState<FarmContext>(createEmptyFarmContext());
  const [isRunning, setIsRunning] = useState(false);
  const [lastCycleTime, setLastCycleTime] = useState<number | null>(null);
  const diseasesRef = useRef<DiseaseResult[]>([]);

  // Subscribe to orchestrator updates
  useEffect(() => {
    const unsub = orchestratorRef.current.subscribe((newCtx) => {
      setCtx(newCtx);
    });
    return unsub;
  }, []);

  // Connect Firebase sensor feed to orchestrator
  useEffect(() => {
    const sensorsRef = ref(rtdb, "/sensor_history");
    const unsub = onValue(
      sensorsRef,
      (snapshot) => {
        const sensors = normalizeSensorPayload(snapshot.val() ?? {});
        orchestratorRef.current.updateSensors(sensors);
      },
      (error) => {
        console.error("Firebase sensor feed error:", error);
      },
    );
    return () => unsub();
  }, []);

  const runCycle = useCallback(async (goalOverride?: UserGoal) => {
    if (isRunning) return;
    setIsRunning(true);
    const start = Date.now();
    try {
      orchestratorRef.current.updateDiseases(diseasesRef.current);
      await orchestratorRef.current.runFullCycle(undefined, goalOverride);
      setLastCycleTime(Date.now() - start);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning]);

  const setGoal = useCallback((goal: UserGoal) => {
    orchestratorRef.current.setGoal(goal);
  }, []);

  const reportDisease = useCallback((disease: DiseaseResult) => {
    diseasesRef.current = [...diseasesRef.current.slice(-4), disease];
    orchestratorRef.current.updateDiseases(diseasesRef.current);
  }, []);

  return (
    <FarmCtx.Provider value={{ ctx, isRunning, runCycle, setGoal, reportDisease, lastCycleTime }}>
      {children}
    </FarmCtx.Provider>
  );
}
