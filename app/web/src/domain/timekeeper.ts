/**
 * Cronómetro global con vueltas (SDD R20, R30). Hay UN solo reloj para toda la app; «Registrar etapa» toma una
 * *vuelta*: el tiempo desde el último registro. Se basa en marcas de tiempo, no en un contador, así que no se
 * desvía si el navegador throttlea la pestaña mientras el usuario trabaja en VS Code.
 *
 * Si la app deja de dar señal mientras el reloj corre (pestaña cerrada, equipo suspendido), al volver se detecta el
 * intervalo ausente, el reloj se congela en la última señal y se pregunta qué hacer con ese tiempo (R30).
 */
export interface Gap {
  /** Última señal de la app antes de la ausencia. */
  from: number;
  /** Cuándo se detectó que había vuelto. */
  to: number;
}

export interface TimerState {
  /** Tiempo acumulado en tramos ya cerrados. */
  accumulatedMs: number;
  /** Inicio del tramo en curso, o null si está en pausa. */
  startedAt: number | null;
  /** Última señal de vida de la app mientras el reloj corría. */
  heartbeatAt: number | null;
  /** Tiempo total (elapsed) en el último registro: base de la vuelta actual. */
  lapBaseMs: number;
  /** Ausencia detectada que el usuario aún no resolvió. */
  gap: Gap | null;
}

export const TIMER_KEY = 'dsc-timer';
/** La clave del cronómetro por etapa anterior a R20 revisado; se descarta. */
export const LEGACY_TIMERS_KEY = 'dsc-timers';
/** Sin señal por más de esto, se considera una ausencia (R30). */
export const GAP_THRESHOLD_MS = 3 * 60_000;

export const initialTimer = (): TimerState => ({ accumulatedMs: 0, startedAt: null, heartbeatAt: null, lapBaseMs: 0, gap: null });

export const isRunning = (s: TimerState): boolean => s.startedAt !== null;

export function elapsedMs(s: TimerState, now: number): number {
  return s.accumulatedMs + (s.startedAt === null ? 0 : Math.max(0, now - s.startedAt));
}

/** Tiempo de la vuelta actual: desde el último registro. */
export function lapMs(s: TimerState, now: number): number {
  return Math.max(0, elapsedMs(s, now) - s.lapBaseMs);
}

export function start(s: TimerState, now: number): TimerState {
  if (s.startedAt !== null || s.gap) return s;
  return { ...s, startedAt: now, heartbeatAt: now };
}

export function pause(s: TimerState, now: number): TimerState {
  if (s.startedAt === null) return s;
  return { ...s, accumulatedMs: elapsedMs(s, now), startedAt: null, heartbeatAt: null };
}

export const reset = (): TimerState => initialTimer();

/** Señal de vida: se llama en cada tick mientras el reloj corre. */
export function beat(s: TimerState, now: number): TimerState {
  return s.startedAt === null ? s : { ...s, heartbeatAt: now };
}

/**
 * Si el reloj corría y no hubo señal por más de `thresholdMs`, congela el reloj en la última señal y registra la
 * ausencia (R30). Nunca suma ese intervalo en silencio.
 */
export function detectGap(s: TimerState, now: number, thresholdMs: number = GAP_THRESHOLD_MS): TimerState {
  if (s.startedAt === null || s.heartbeatAt === null || s.gap) return s;
  if (now - s.heartbeatAt <= thresholdMs) return s;
  return {
    ...s,
    accumulatedMs: s.accumulatedMs + Math.max(0, s.heartbeatAt - s.startedAt),
    startedAt: null,
    heartbeatAt: null,
    gap: { from: s.heartbeatAt, to: now },
  };
}

export type GapChoice = 'descartar' | 'contar' | 'pausar';

/**
 * - `descartar` (por defecto): el intervalo no cuenta y el reloj sigue desde ahora.
 * - `contar`: el intervalo se suma al tiempo y el reloj sigue.
 * - `pausar`: el intervalo no cuenta y el reloj queda en pausa.
 */
export function resolveGap(s: TimerState, choice: GapChoice, now: number): TimerState {
  if (!s.gap) return s;
  const base = { ...s, gap: null };
  if (choice === 'pausar') return base;
  const accumulatedMs = s.accumulatedMs + (choice === 'contar' ? s.gap.to - s.gap.from : 0);
  return { ...base, accumulatedMs, startedAt: now, heartbeatAt: now };
}

/** Toma la vuelta al registrar una etapa: devuelve su duración y deja la base en el tiempo actual. */
export function takeLap(s: TimerState, now: number): { state: TimerState; ms: number } {
  const total = elapsedMs(s, now);
  return { state: { ...s, lapBaseMs: total }, ms: Math.max(0, total - s.lapBaseMs) };
}

/** `mm:ss`, o `h:mm:ss` a partir de la hora. */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Minutos enteros para el registro; cualquier tiempo medido cuenta como mínimo 1. */
export function toMinutes(ms: number): number {
  return ms <= 0 ? 0 : Math.max(1, Math.round(ms / 60_000));
}

const num = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min;

/** Lee el estado guardado; ante cualquier dato inválido devuelve un estado vacío. */
export function parseTimer(raw: string | null | undefined): TimerState {
  if (!raw) return initialTimer();
  try {
    const v = JSON.parse(raw) as Partial<TimerState> | null;
    if (!v || typeof v !== 'object') return initialTimer();
    if (!num(v.accumulatedMs) || !num(v.lapBaseMs)) return initialTimer();
    const startedAt = v.startedAt === null || v.startedAt === undefined ? null : num(v.startedAt) ? v.startedAt : NaN;
    if (Number.isNaN(startedAt)) return initialTimer();
    const heartbeatAt = v.heartbeatAt === null || v.heartbeatAt === undefined ? null : num(v.heartbeatAt) ? v.heartbeatAt : NaN;
    if (Number.isNaN(heartbeatAt)) return initialTimer();
    const gap = v.gap && num(v.gap.from) && num(v.gap.to) ? { from: v.gap.from, to: v.gap.to } : null;
    return {
      accumulatedMs: v.accumulatedMs,
      startedAt,
      // Si estaba corriendo y no hay señal guardada, la última señal conocida es el inicio del tramo.
      heartbeatAt: startedAt !== null ? (heartbeatAt ?? startedAt) : null,
      lapBaseMs: Math.min(v.lapBaseMs, v.accumulatedMs + (startedAt !== null ? Number.MAX_SAFE_INTEGER : 0)),
      gap,
    };
  } catch {
    return initialTimer();
  }
}

export const serializeTimer = (s: TimerState): string => JSON.stringify(s);
