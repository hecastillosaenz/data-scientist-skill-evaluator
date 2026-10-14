import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LEGACY_TIMERS_KEY,
  TIMER_KEY,
  beat,
  detectGap,
  elapsedMs,
  formatClock,
  isRunning,
  lapMs,
  parseTimer,
  pause as pauseTimer,
  reset as resetTimer,
  resolveGap as resolveTimerGap,
  serializeTimer,
  start as startTimer,
  takeLap as takeTimerLap,
  type Gap,
  type GapChoice,
  type TimerState,
} from '../domain/timekeeper';

interface TimekeeperState {
  running: boolean;
  /** Tiempo total del cronómetro global. */
  elapsed: number;
  /** Tiempo de la vuelta actual: desde el último registro. */
  lap: number;
  /** Ausencia detectada sin resolver (R30). */
  gap: Gap | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Toma la vuelta al registrar una etapa y devuelve sus milisegundos. */
  takeLap: () => number;
  resolveGap: (choice: GapChoice) => void;
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
 * Un único cronómetro global (R20). Vive en el navegador (`localStorage`), sobrevive a recargas y se sincroniza entre
 * pestañas. Como el usuario resuelve en VS Code, NO se pausa al perder el foco: corre por marcas de tiempo. Si la app
 * deja de dar señal por más de 3 minutos (pestaña cerrada, equipo suspendido) se pregunta qué hacer con el intervalo (R30).
 */
export function TimekeeperProvider({ children }: { children: ReactNode }) {
  const [timer, setTimer] = useState<TimerState>(() => {
    try {
      storage()?.removeItem(LEGACY_TIMERS_KEY);
    } catch {
      /* ignorar */
    }
    // Al abrir la app se comprueba de inmediato si hubo una ausencia mientras estaba cerrada.
    return detectGap(parseTimer(storage()?.getItem(TIMER_KEY)), Date.now());
  });
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef(timer);
  timerRef.current = timer;
  const running = isRunning(timer);

  // Persistencia.
  useEffect(() => {
    try {
      storage()?.setItem(TIMER_KEY, serializeTimer(timer));
    } catch {
      /* sin almacenamiento: el cronómetro funciona, pero no sobrevive a una recarga */
    }
  }, [timer]);

  // Latido: cada segundo mientras corre. Antes de latir se comprueba si hubo una ausencia (p. ej. tras suspender el equipo).
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      setTimer((t) => beat(detectGap(t, at), at));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Al volver a la pestaña (o al enfocarla) se comprueba la ausencia sin esperar al siguiente tick.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      const at = Date.now();
      setNow(at);
      setTimer((t) => detectGap(t, at));
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  // Sincroniza con otras pestañas de la misma app.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TIMER_KEY) setTimer(parseTimer(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    document.title = running ? `● ${formatClock(elapsedMs(timer, now))} · ${BASE_TITLE}` : BASE_TITLE;
  }, [running, timer, now]);

  const start = useCallback(() => setTimer((t) => startTimer(t, Date.now())), []);
  const pause = useCallback(() => setTimer((t) => pauseTimer(t, Date.now())), []);
  const reset = useCallback(() => setTimer(resetTimer()), []);
  const resolveGap = useCallback((choice: GapChoice) => setTimer((t) => resolveTimerGap(t, choice, Date.now())), []);
  const takeLap = useCallback(() => {
    const result = takeTimerLap(timerRef.current, Date.now());
    setTimer(result.state);
    return result.ms;
  }, []);

  const at = running ? now : Date.now();
  const value = useMemo<TimekeeperState>(
    () => ({ running, elapsed: elapsedMs(timer, at), lap: lapMs(timer, at), gap: timer.gap, start, pause, reset, takeLap, resolveGap }),
    // `at` cambia cada segundo mientras corre; en pausa solo cuando cambia el estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [running, timer, now, start, pause, reset, takeLap, resolveGap],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTimekeeper(): TimekeeperState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTimekeeper debe usarse dentro de <TimekeeperProvider>');
  return ctx;
}
