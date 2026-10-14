import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  TIMERS_KEY,
  elapsedMs,
  formatClock,
  parseTimers,
  pause as pauseTimer,
  reset as resetTimer,
  runningStageId,
  serializeTimers,
  start as startTimer,
  type TimerState,
} from '../domain/timekeeper';

interface TimekeeperState {
  /** Etapa con el cronómetro corriendo, o null. */
  running: string | null;
  elapsed: (stageId: string) => number;
  start: (stageId: string) => void;
  pause: (stageId: string) => void;
  reset: (stageId: string) => void;
}

const Ctx = createContext<TimekeeperState | null>(null);
const BASE_TITLE = 'Data Scientist Challenges';

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * Los cronómetros viven en el navegador (localStorage) y sobreviven a recargas. Más adelante el orquestador
 * los registrará en `logs-avance.md` (SDD §8.1). Se actualiza cada segundo solo mientras hay uno corriendo.
 */
export function TimekeeperProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<TimerState>(() => parseTimers(storage()?.getItem(TIMERS_KEY)));
  const [now, setNow] = useState(() => Date.now());
  const running = runningStageId(timers);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    try {
      storage()?.setItem(TIMERS_KEY, serializeTimers(timers));
    } catch {
      /* sin almacenamiento: el cronómetro funciona, pero no sobrevive a una recarga */
    }
  }, [timers]);

  useEffect(() => {
    document.title = running ? `● ${formatClock(elapsedMs(timers[running], now))} · ${BASE_TITLE}` : BASE_TITLE;
  }, [running, timers, now]);

  const start = useCallback((id: string) => setTimers((t) => startTimer(t, id, Date.now())), []);
  const pause = useCallback((id: string) => setTimers((t) => pauseTimer(t, id, Date.now())), []);
  const reset = useCallback((id: string) => setTimers((t) => resetTimer(t, id)), []);
  const elapsed = useCallback((id: string) => elapsedMs(timers[id], running === id ? now : Date.now()), [timers, running, now]);

  const value = useMemo(() => ({ running, elapsed, start, pause, reset }), [running, elapsed, start, pause, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTimekeeper(): TimekeeperState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTimekeeper debe usarse dentro de <TimekeeperProvider>');
  return ctx;
}
