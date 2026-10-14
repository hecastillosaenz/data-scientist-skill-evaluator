import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Apoyo, BusinessAnswer, Challenge, Evidence, TestResult } from '../../shared/types';
import { writeFileAtomic } from '../atomic-write';

/** `challenge-N/progreso.json` (R33): fuente de verdad del avance. */
export interface Progress {
  version: 1;
  /** ISO 8601 del primer «Iniciar challenge»; null si aún no se inició. */
  startedAt: string | null;
  /** Apoyo vigente por etapa (sobrescribe el inicial del challenge). */
  apoyos: Record<string, Apoyo>;
  evidence: Evidence[];
  businessAnswers: BusinessAnswer[];
  testResults: TestResult[];
}

export const emptyProgress = (): Progress => ({ version: 1, startedAt: null, apoyos: {}, evidence: [], businessAnswers: [], testResults: [] });

/** `progreso.json` existe pero no se puede leer: se rechaza la operación y el archivo no se toca (R33). */
export class ProgressCorruptError extends Error {
  constructor(readonly file: string, reason: string) {
    super(`No pude leer ${file}: ${reason} No lo modifiqué; corrígelo o restáuralo desde git.`);
    this.name = 'ProgressCorruptError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const progressPath = (dir: string): string => path.join(dir, 'progreso.json');
export const logPath = (dir: string): string => path.join(dir, 'logs-avance.md');

export async function readProgress(dir: string): Promise<Progress> {
  const file = `${path.basename(dir)}/progreso.json`;
  let text: string;
  try {
    text = await readFile(progressPath(dir), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyProgress();
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProgressCorruptError(file, 'no es un JSON válido.');
  }
  if (!isRecord(json) || json.version !== 1) throw new ProgressCorruptError(file, 'su `version` no es 1.');
  for (const key of ['evidence', 'businessAnswers', 'testResults'] as const) {
    if (!Array.isArray(json[key])) throw new ProgressCorruptError(file, `\`${key}\` debe ser una lista.`);
  }
  if (!isRecord(json.apoyos)) throw new ProgressCorruptError(file, '`apoyos` debe ser un objeto.');
  if (json.startedAt !== null && typeof json.startedAt !== 'string') throw new ProgressCorruptError(file, '`startedAt` debe ser una fecha o null.');
  return json as unknown as Progress;
}

/** Una cola por archivo: lee-modifica-escribe una operación a la vez, sin perder ni rechazar escrituras (SDD §8.3). */
const queues = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(job, job);
  queues.set(key, run.catch(() => {}));
  return run;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** `2026-10-14 10:32` en hora local del equipo. */
export function stamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Aplica `change` al progreso de forma atómica y serializada. `change` devuelve las entradas legibles que se agregan a
 * `logs-avance.md` (R34); si no cambió nada devuelve `[]` y no se escribe.
 */
export async function updateProgress<R>(
  dir: string,
  change: (progress: Progress) => { entries: string[]; result: R },
): Promise<R> {
  return serialized(dir, async () => {
    const progress = await readProgress(dir);
    const { entries, result } = change(progress);
    if (entries.length === 0) return result;
    await writeFileAtomic(progressPath(dir), `${JSON.stringify(progress, null, 2)}\n`);
    await appendFile(logPath(dir), `\n${entries.join('\n\n')}\n`, 'utf8');
    return result;
  });
}

const RESULT_LABEL = { aprobada: 'Aprobada', parcial: 'Parcial', fallida: 'Fallida' } as const;
const APOYO_LABEL = { guiado: 'Guiado', pistas: 'Pistas', autonomo: 'Autónomo' } as const;
const BLOCKER_LABEL = { concepto: 'Concepto', sintaxis: 'Sintaxis', enfoque: 'Enfoque', datos: 'Datos', tiempo: 'Tiempo' } as const;
const quote = (text: string) => text.trim().split('\n').map((l) => `> ${l}`).join('\n');

export function startEntry(at: string): string {
  return `## ${stamp(at)} · Challenge iniciado`;
}

export function apoyoEntry(at: string, stageNumber: number, from: Apoyo, to: Apoyo): string {
  return `## ${stamp(at)} · Etapa ${stageNumber} · Apoyo ${APOYO_LABEL[from]} → ${APOYO_LABEL[to]}`;
}

export function evidenceEntry(e: Evidence, stageNumber: number, stageTitle: string): string {
  const time = `${e.actualMinutes} min${e.timeSource === 'manual' ? ' (editado a mano)' : e.timeSource === 'cronometro' ? ' (cronómetro)' : ''}`;
  const lines = [
    `## ${stamp(e.at)} · Etapa ${stageNumber} · ${stageTitle} · ${RESULT_LABEL[e.result]}`,
    `- Apoyo: ${APOYO_LABEL[e.apoyo]} · Tiempo real: ${time} · Solución abierta: ${e.withHelp ? 'sí (Con ayuda)' : 'no'}`,
  ];
  if (e.blocker) lines.push(`- Dónde te trabaste: ${BLOCKER_LABEL[e.blocker]}`);
  if (e.notes) lines.push('- Notas:', quote(e.notes));
  return lines.join('\n');
}

export function answersEntry(answers: BusinessAnswer[], challenge: Challenge): string {
  const blocks = answers.map((a) => {
    const q = challenge.businessQuestions.find((b) => b.id === a.questionId);
    return [`**${q?.text ?? a.questionId}**`, quote(a.text)].join('\n');
  });
  return [`## ${stamp(answers[0]!.at)} · Preguntas de negocio (${answers.length})`, ...blocks].join('\n\n');
}

export function testEntry(results: TestResult[], challenge: Challenge): string {
  const correct = results.filter((r) => r.correct).length;
  const failed = [...new Set(results.filter((r) => !r.correct).map((r) => r.conceptId))];
  const lines = [`## ${stamp(results[0]!.at)} · Test final · ${correct} de ${results.length}`];
  if (failed.length > 0) lines.push(`- Conceptos a reforzar: ${failed.join(', ')}`);
  else lines.push(`- Sin fallos en «${challenge.title}».`);
  return lines.join('\n');
}
