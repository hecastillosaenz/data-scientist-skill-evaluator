import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { writeFileAtomic } from '../atomic-write';
import type { AgentRole, RunEventLog, RunMeta, RunOutcome, RunRecord, RunSummary } from '../../shared/agentes';
import { AGENT_ROLES } from '../../shared/agentes';
import { AgentError, type AgentEvent, type AgentResult, type AgentRunOptions } from './agent-runner';

/**
 * Registro de ejecuciones de agentes (SDD R46): una invocación = un JSON en `registro-agentes/ejecuciones/`, local y fuera
 * de git. Es de solo observación: un fallo al escribirlo NUNCA interrumpe ni cambia la ejecución del agente.
 */
export { AGENT_ROLES, type AgentRole, type RunEventLog, type RunMeta, type RunOutcome, type RunRecord, type RunSummary };

export const MAX_INPUT = 60_000;
export const MAX_OUTPUT = 30_000;
export const MAX_EVENTS = 300;
export const MAX_EVENT_TEXT = 4_000;

export const runsDir = (repoRoot: string): string => path.join(repoRoot, 'registro-agentes', 'ejecuciones');
const ID_PATTERN = /^\d{8}T\d{9}Z-[a-z-]+-[0-9a-f]{4}$/;
export const isRunId = (id: string): boolean => ID_PATTERN.test(id);

/** Ejecuciones de este proceso que siguen corriendo: una que figura «en curso» en disco y no está aquí quedó interrumpida. */
const active = new Set<string>();
export const activeRunIds = (): ReadonlySet<string> => active;

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace('.', '');
const cap = (text: string, max: number): { text: string; truncated: boolean } => (text.length > max ? { text: `${text.slice(0, max)}…`, truncated: true } : { text, truncated: false });

type RunAgentFn = (opts: AgentRunOptions) => Promise<AgentResult>;

/**
 * Envuelve `runAgent` para registrar cada invocación con su rol. Devuelve una función con la misma firma, así que los
 * servicios la usan igual y los tests siguen sustituyendo `deps.runAgent`.
 */
export function recordAgent(repoRoot: string, rol: AgentRole, base: RunAgentFn, meta: RunMeta = {}, now: () => Date = () => new Date()): RunAgentFn {
  return async (opts) => {
    const started = now();
    const id = `${stamp(started)}-${rol}-${randomBytes(2).toString('hex')}`;
    const file = path.join(runsDir(repoRoot), `${id}.json`);
    const input = cap(opts.message, MAX_INPUT);
    const events: RunEventLog[] = [];
    let eventsTruncated = false;
    const record: RunRecord = {
      id,
      rol,
      startedAt: started.toISOString(),
      outcome: 'en_curso',
      ...(opts.maxUsd !== undefined ? { maxUsd: opts.maxUsd } : {}),
      cost: 0,
      ...meta,
      input: input.text,
      ...(input.truncated ? { inputTruncated: true } : {}),
      events,
    };

    // Escrituras en cadena y a prueba de fallos: el registro nunca debe romper al agente (R46).
    let chain: Promise<unknown> = Promise.resolve();
    const persist = () => {
      const snapshot = JSON.stringify({ ...record, ...(eventsTruncated ? { eventsTruncated: true } : {}) }, null, 2);
      chain = chain.then(async () => {
        await mkdir(runsDir(repoRoot), { recursive: true });
        await writeFileAtomic(file, `${snapshot}\n`);
      }).catch(() => {});
    };
    active.add(id);
    persist();

    const onEvent = (event: AgentEvent) => {
      if (events.length < MAX_EVENTS) events.push({ type: event.type, text: cap(event.text, MAX_EVENT_TEXT).text });
      else eventsTruncated = true;
      opts.onEvent?.(event);
    };

    const finish = (patch: Partial<RunRecord>) => {
      const ended = now();
      Object.assign(record, patch, { endedAt: ended.toISOString(), durationMs: Math.max(0, ended.getTime() - started.getTime()) });
      active.delete(id);
      persist();
      return chain;
    };

    try {
      const result = await base({ ...opts, onEvent });
      const output = cap(result.text, MAX_OUTPUT);
      await finish({ outcome: 'ok', cost: result.cost, output: output.text, ...(output.truncated ? { outputTruncated: true } : {}) });
      return result;
    } catch (err) {
      const code = err instanceof AgentError ? err.code : 'internal';
      await finish({
        outcome: code === 'aborted' ? 'cancelado' : code === 'budget' ? 'presupuesto' : 'error',
        errorCode: code,
        errorMessage: (err as Error).message,
      });
      throw err;
    }
  };
}

const parseRecord = (text: string): RunRecord | null => {
  try {
    const v = JSON.parse(text) as RunRecord;
    return typeof v?.id === 'string' && typeof v.rol === 'string' && typeof v.startedAt === 'string' ? v : null;
  } catch {
    return null;
  }
};

/** Una ejecución «en curso» en disco que ya no corre en este proceso quedó interrumpida (se cerró la app, `kill`…). */
const settle = (r: RunRecord): RunRecord => (r.outcome === 'en_curso' && !active.has(r.id) ? { ...r, outcome: 'interrumpida' } : r);

export const summarize = (r: RunRecord): RunSummary => {
  const { input: _i, inputTruncated: _it, events, eventsTruncated: _et, output: _o, outputTruncated: _ot, ...rest } = r;
  return { ...rest, eventCount: events.length };
};

/** Todas las ejecuciones conservadas, de la más reciente a la más antigua. Lo ilegible se ignora. */
export async function readRuns(repoRoot: string): Promise<RunRecord[]> {
  let names: string[];
  try {
    names = (await readdir(runsDir(repoRoot))).filter((n) => n.endsWith('.json') && isRunId(n.slice(0, -5)));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  names.sort().reverse(); // el id empieza por la fecha: orden de archivo = orden cronológico
  const runs = await Promise.all(names.map(async (n) => parseRecord(await readFile(path.join(runsDir(repoRoot), n), 'utf8').catch(() => ''))));
  return runs.filter((r): r is RunRecord => r !== null).map(settle);
}

export async function readRun(repoRoot: string, id: string): Promise<RunRecord | null> {
  if (!isRunId(id)) return null;
  try {
    const r = parseRecord(await readFile(path.join(runsDir(repoRoot), `${id}.json`), 'utf8'));
    return r ? settle(r) : null;
  } catch {
    return null;
  }
}

/** Borra los registros más viejos que `days` (R46). Devuelve cuántos quitó. */
export async function purgeRuns(repoRoot: string, days: number, now: Date): Promise<number> {
  let names: string[];
  try {
    names = await readdir(runsDir(repoRoot));
  } catch {
    return 0;
  }
  const cutoff = stamp(new Date(now.getTime() - days * 86_400_000));
  let removed = 0;
  for (const n of names) {
    const id = n.slice(0, -5);
    if (!n.endsWith('.json') || !isRunId(id) || id.slice(0, 19) >= cutoff.slice(0, 19)) continue;
    if (active.has(id)) continue;
    await rm(path.join(runsDir(repoRoot), n), { force: true }).catch(() => {});
    removed++;
  }
  return removed;
}
