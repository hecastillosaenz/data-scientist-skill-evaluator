import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StatePayload } from '../../shared/state';
import { readAttempts } from '../attempts/attempt-store';
import { scanChallenges } from '../challenges/challenge-fs';
import { configDir } from '../paths';
import { readGraph } from './graph-store';
import { ProgressCorruptError, readProgress } from './progress-store';

export async function readUserName(repoRoot: string): Promise<string> {
  try {
    const json = JSON.parse(await readFile(path.join(configDir(repoRoot), 'usuario.json'), 'utf8')) as { name?: unknown };
    if (typeof json.name === 'string' && json.name.trim() !== '') return json.name.trim();
  } catch {
    /* sin archivo: se usa el nombre por defecto */
  }
  return 'Usuario';
}


export interface ReadStateOptions {
  repoRoot: string;
  /** Modo estricto del contrato de challenges (R29). */
  strict: boolean;
  now?: () => Date;
}

/** Lee catálogo, challenges y todo el progreso; un progreso ilegible se reporta en `problems` sin romper el resto. */
export async function readState(opts: ReadStateOptions): Promise<StatePayload> {
  const now = opts.now ?? (() => new Date());
  const [graph, scan, name] = await Promise.all([
    readGraph(opts.repoRoot),
    scanChallenges(opts.repoRoot, { strict: opts.strict }),
    readUserName(opts.repoRoot),
  ]);
  const payload: StatePayload = {
    data: { user: { name }, now: now().toISOString(), concepts: graph.concepts, challenges: [], evidence: [], businessAnswers: [], testResults: [] },
    apoyos: {},
    started: {},
    attempts: [],
    invalid: scan.invalid,
    problems: [],
    analysis: { pending: [], running: false, failed: {} },
  };
  for (const { dir, challenge } of scan.loaded) {
    payload.data.challenges.push(challenge);
    payload.attempts.push(...(await readAttempts(dir)));
    try {
      const p = await readProgress(dir);
      payload.data.evidence.push(...p.evidence);
      payload.data.businessAnswers.push(...p.businessAnswers);
      payload.data.testResults.push(...p.testResults);
      Object.assign(payload.apoyos, p.apoyos);
      if (p.startedAt) payload.started[challenge.id] = p.startedAt;
    } catch (err) {
      if (!(err instanceof ProgressCorruptError)) throw err;
      payload.problems.push(err.message);
    }
  }
  payload.data.observations = graph.observations ?? [];
  payload.data.candidates = graph.candidates ?? [];
  const analyzed = new Set(payload.data.observations.map((o) => o.evidenceId));
  payload.analysis.pending = payload.data.evidence.filter((e) => !analyzed.has(e.id)).map((e) => e.id);
  return payload;
}
