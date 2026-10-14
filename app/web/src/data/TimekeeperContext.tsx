import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LEGACY_TIMER_KEYS,
  TIMERS_KEY,
  beat,
  detectGap,
  elapsedMs,
  formatClock,
  isRunning,
  lapMs,
  mapTimers,
  parseBook,
  pause as pauseTimer,
  pendingGap,
  reset as resetTimer,
  resolveGap as resolveTimerGap,
  runningId as runningIdOf,
  serializeBook,
  startIn,
  takeLap as takeTimerLap,
  timerOf,
  updateTimer,
  type Gap,
  type GapChoice,
  type TimerBook,
} from '../domain/timekeeper';

/** El cronómetro de un challenge (R20). */
interface TimerView {
  running: boolean;
  /** Tiempo total del cronómetro de este challenge. */
  elapsed: number;
  /** Tiempo de la vuelta actual: desde el último registro de este challenge. */
  lap: number;
  /** Inicia este cronómetro y pausa el que corriera en otro challenge. */
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Toma la vuelta al registrar una etapa y devuelve sus milisegundos. */
  takeLap: () => number;
}

/** Lo que necesita la píldora y el diálogo de ausencia, que no pertenecen a un challenge en particular. */
interface Overview {
  /** El challenge cuyo cronómetro está en marcha, si hay uno. */
  runningId: string | null;
  /** Ausencia detectada sin resolver (R30) y el challenge al que pertenece. */
  gap: { id: string; gap: Gap } | null;
  resolveGap: (id: string, choice: GapChoice) => void;
}

interface TimekeeperState {
  book: TimerBook;
  now: number;
  overview: Overview;
  actions: {
    start: (id: string) => void;
    pause: (id: string) => void;
    reset: (id: string) => void;
    takeLap: (id: string) => number;
  };
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
 * Un cronómetro por challenge (R20), todos en un solo libro del navegador (`localStorage`); sobrevive a recargas y se
 * sincroniza entre pestañas. Solo uno corre a la vez. Como el usuario resuelve en VS Code, NO se pausa al perder el
 * foco: corre por marcas de tiempo. Si la app deja de dar señal por más de 3 minutos se pregunta qué hacer con el
 * intervalo (R30).
 */
export function TimekeeperProvider({ children }: { children: ReactNode }) {
  const [book, setBook] = useState<TimerBook>(() => {
    try {
      for (const key of LEGACY_TIMER_KEYS) storage()?.removeItem(key);
    } catch {
      /* ignorar */
    }
    // Al abrir la app se comprueba de inmediato si hubo una ausencia mientras estaba cerrada.
    const at = Date.now();
    return mapTimers(parseBook(storage()?.getItem(TIMERS_KEY)), (t) => detectGap(t, at));
  });
  const [now, setNow] = useState(() => Date.now());
  const bookRef = useRef(book);
  bookRef.current = book;
  const runningId = runningIdOf(book);
  const running = runningId !== null;

  // Persistencia.
  useEffect(() => {
    try {
      storage()?.setItem(TIMERS_KEY, serializeBook(book));
    } catch {
      /* sin almacenamiento: el cronómetro funciona, pero no sobrevive a una recarga */
    }
  }, [book]);

  // Latido: cada segundo mientras corre. Antes de latir se comprueba si hubo una ausencia (p. ej. tras suspender el equipo).
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      setBook((b) => mapTimers(b, (t) => beat(detectGap(t, at), at)));
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
      setBook((b) => mapTimers(b, (t) => detectGap(t, at)));
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
      if (e.key === TIMERS_KEY) setBook(parseBook(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const t = runningId ? timerOf(book, runningId) : null;
    document.title = t ? `● ${formatClock(elapsedMs(t, now))} · ${BASE_TITLE}` : BASE_TITLE;
  }, [runningId, book, now]);

  const value = useMemo<TimekeeperState>(() => {
    const resolveGap = (id: string, choice: GapChoice) => setBook((b) => updateTimer(b, id, (t) => resolveTimerGap(t, choice, Date.now())));
    return {
      book,
      now,
      overview: { runningId, gap: pendingGap(book), resolveGap },
      actions: {
        start: (id) => setBook((b) => startIn(b, id, Date.now())),
        pause: (id) => setBook((b) => updateTimer(b, id, (t) => pauseTimer(t, Date.now()))),
        reset: (id) => setBook((b) => updateTimer(b, id, () => resetTimer())),
        takeLap: (id) => {
          const result = takeTimerLap(timerOf(bookRef.current, id), Date.now());
          setBook((b) => updateTimer(b, id, () => result.state));
          return result.ms;
        },
      },
    };
  }, [book, now, runningId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useTimekeeperState(): TimekeeperState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTimekeeper debe usarse dentro de <TimekeeperProvider>');
  return ctx;
}

/** El cronómetro de un challenge (R20): tiempo total, vuelta actual y controles. */
export function useTimekeeper(challengeId: string): TimerView {
  const { book, now, actions } = useTimekeeperState();
  const t = timerOf(book, challengeId);
  // `now` solo se actualiza mientras algo corre; en pausa el tiempo no depende del reloj.
  const at = isRunning(t) ? now : Date.now();
  return {
    running: isRunning(t),
    elapsed: elapsedMs(t, at),
    lap: lapMs(t, at),
    start: () => actions.start(challengeId),
    pause: () => actions.pause(challengeId),
    reset: () => actions.reset(challengeId),
    takeLap: () => actions.takeLap(challengeId),
  };
}

/** Estado general de los cronómetros: cuál corre y si hay una ausencia por resolver. */
export function useTimerOverview(): Overview {
  return useTimekeeperState().overview;
}
