import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Attempt, AttemptSummary } from '../../shared/intentos';
import { FALLO_LABEL } from '../../shared/intentos';
import { writeFileAtomic } from '../atomic-write';
import { logPath, stamp } from '../persistence/progress-store';

/**
 * Intentos (SDD R51–R54): una carpeta por verificación en `challenge/challenge-NNN/intentos/NNN-etapa-X/` con
 * `intento.json` y el entregable (`entregable.py` o `entregable.md`). Solo de añadir: nunca se reescribe ni se borra uno.
 * `intento.json` se escribe al final, así una carpeta a medias (sin él) se ignora al leer.
 */
const FOLDER = /^(\d{3,})-etapa-(\d+)$/;
const RESULT_LABEL = { aprobada: 'Aprobada', parcial: 'Parcial', fallida: 'Fallida' } as const;
const APOYO_LABEL = { guiado: 'Guiado', pistas: 'Pistas', autonomo: 'Autónomo' } as const;

export const attemptsDir = (challengeDir: string): string => path.join(challengeDir, 'intentos');
const pad = (n: number) => String(n).padStart(3, '0');
const entregableFile = (kind: 'code' | 'markdown') => (kind === 'code' ? 'entregable.py' : 'entregable.md');

async function folders(challengeDir: string): Promise<{ number: number; stage: number; name: string }[]> {
  try {
    return (await readdir(attemptsDir(challengeDir)))
      .map((name) => ({ name, m: FOLDER.exec(name) }))
      .filter((f): f is { name: string; m: RegExpExecArray } => f.m !== null)
      .map(({ name, m }) => ({ number: Number(m[1]), stage: Number(m[2]), name }))
      .sort((a, b) => a.number - b.number);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export type NewAttempt = Omit<Attempt, 'id' | 'number' | 'folder'>;

/** Guarda un intento nuevo con el siguiente número correlativo y devuelve su resumen. Añade una línea a `logs-avance.md` (R53). */
export async function saveAttempt(challengeDir: string, input: NewAttempt): Promise<AttemptSummary> {
  const { entregable, feedback, ...rest } = input;
  await mkdir(attemptsDir(challengeDir), { recursive: true });
  // `mkdir` sin `recursive` falla si la carpeta ya existe: nunca se pisa un intento anterior.
  let number = ((await folders(challengeDir)).at(-1)?.number ?? 0) + 1;
  let name = '';
  for (let tries = 0; ; tries++) {
    name = `${pad(number)}-etapa-${input.stageNumber}`;
    try {
      await mkdir(path.join(attemptsDir(challengeDir), name));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' || tries > 20) throw err;
      number += 1;
    }
  }
  const folder = `intentos/${name}`;
  const dir = path.join(challengeDir, folder);
  const summary: AttemptSummary = { ...rest, id: `${input.challengeId}-i${pad(number)}`, number, folder };
  await writeFileAtomic(path.join(dir, entregableFile(input.kind)), entregable.endsWith('\n') ? entregable : `${entregable}\n`);
  await writeFileAtomic(path.join(dir, 'intento.json'), `${JSON.stringify({ ...summary, feedback }, null, 2)}\n`);
  await appendFile(logPath(challengeDir), `\n${attemptEntry(summary)}\n`, 'utf8');
  return summary;
}

/** Línea legible de `logs-avance.md` para un intento (R53). */
export function attemptEntry(a: AttemptSummary): string {
  const lines = [`## ${stamp(a.at)} · Intento ${a.number} · Etapa ${a.stageNumber} · ${RESULT_LABEL[a.result]}`, `- Apoyo: ${APOYO_LABEL[a.apoyo]} · Código guardado en \`${a.folder}/\``];
  if (a.fallo) lines.push(`- Falló en: ${FALLO_LABEL[a.fallo.tipo]} — ${a.fallo.resumen}`);
  return lines.join('\n');
}

const parseSummary = (text: string): (AttemptSummary & { feedback?: string }) | null => {
  try {
    const v = JSON.parse(text) as AttemptSummary & { feedback?: string };
    return typeof v?.id === 'string' && typeof v.number === 'number' && typeof v.stageNumber === 'number' ? v : null;
  } catch {
    return null;
  }
};

/** Resúmenes de todos los intentos de un challenge, en orden. Una carpeta sin `intento.json` válido se ignora. */
export async function readAttempts(challengeDir: string): Promise<AttemptSummary[]> {
  const out: AttemptSummary[] = [];
  for (const f of await folders(challengeDir)) {
    const text = await readFile(path.join(attemptsDir(challengeDir), f.name, 'intento.json'), 'utf8').catch(() => '');
    const parsed = text ? parseSummary(text) : null;
    if (!parsed) continue;
    const { feedback: _feedback, ...summary } = parsed;
    out.push(summary);
  }
  return out;
}

/** Un intento completo, con el snapshot del entregable y el feedback; `null` si no existe. */
export async function readAttempt(challengeDir: string, number: number): Promise<Attempt | null> {
  const f = (await folders(challengeDir)).find((x) => x.number === number);
  if (!f) return null;
  const dir = path.join(attemptsDir(challengeDir), f.name);
  const parsed = parseSummary(await readFile(path.join(dir, 'intento.json'), 'utf8').catch(() => ''));
  if (!parsed) return null;
  const { feedback, ...summary } = parsed;
  const entregable = await readFile(path.join(dir, entregableFile(summary.kind)), 'utf8').catch(() => '');
  return { ...summary, feedback: feedback ?? '', entregable };
}
