/**
 * Cronómetro por etapa (R20). Se basa en marcas de tiempo, no en un contador: si el navegador throttlea la pestaña
 * el tiempo no se desvía. Solo una etapa puede estar corriendo a la vez.
 */
export interface TimerEntry {
  accumulatedMs: number;
  /** Marca de inicio del tramo en curso, o null si está en pausa. */
  startedAt: number | null;
}
export type TimerState = Record<string, TimerEntry>;

export const TIMERS_KEY = 'dsc-timers';

export function elapsedMs(entry: TimerEntry | undefined, now: number): number {
  if (!entry) return 0;
  return entry.accumulatedMs + (entry.startedAt === null ? 0 : Math.max(0, now - entry.startedAt));
}

export function runningStageId(state: TimerState): string | null {
  return Object.entries(state).find(([, e]) => e.startedAt !== null)?.[0] ?? null;
}

const pauseEntry = (entry: TimerEntry, now: number): TimerEntry => ({ accumulatedMs: elapsedMs(entry, now), startedAt: null });

/** Inicia (o reanuda) el cronómetro de una etapa y pausa cualquier otro que estuviera corriendo. */
export function start(state: TimerState, stageId: string, now: number): TimerState {
  const next: TimerState = {};
  for (const [id, entry] of Object.entries(state)) next[id] = id === stageId ? entry : pauseEntry(entry, now);
  const current = next[stageId] ?? { accumulatedMs: 0, startedAt: null };
  next[stageId] = current.startedAt === null ? { ...current, startedAt: now } : current;
  return next;
}

export function pause(state: TimerState, stageId: string, now: number): TimerState {
  const entry = state[stageId];
  return entry ? { ...state, [stageId]: pauseEntry(entry, now) } : state;
}

export function reset(state: TimerState, stageId: string): TimerState {
  const { [stageId]: _removed, ...rest } = state;
  return rest;
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

const isEntry = (v: unknown): v is TimerEntry =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as TimerEntry).accumulatedMs === 'number' &&
  (v as TimerEntry).accumulatedMs >= 0 &&
  ((v as TimerEntry).startedAt === null || typeof (v as TimerEntry).startedAt === 'number');

/** Lee el estado guardado; descarta entradas inválidas y, ante cualquier fallo, devuelve un estado vacío. */
export function parseTimers(raw: string | null | undefined): TimerState {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: TimerState = {};
    for (const [id, entry] of Object.entries(parsed)) if (isEntry(entry)) out[id] = entry;
    // Si por algún motivo hay más de uno corriendo, solo se conserva el primero.
    let seen = false;
    for (const [id, entry] of Object.entries(out)) {
      if (entry.startedAt === null) continue;
      if (seen) out[id] = { accumulatedMs: entry.accumulatedMs, startedAt: null };
      seen = true;
    }
    return out;
  } catch {
    return {};
  }
}

export const serializeTimers = (state: TimerState): string => JSON.stringify(state);
