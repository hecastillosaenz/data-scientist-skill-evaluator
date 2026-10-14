import type { Apoyo, BusinessAnswer, Evidence, TestResult } from '../../shared/types';

/** Validación de los registros que llegan del navegador (R33): forma, enumeraciones y que pertenezcan al challenge. */
export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const APOYOS: readonly string[] = ['guiado', 'pistas', 'autonomo'];
const RESULTS: readonly string[] = ['aprobada', 'parcial', 'fallida'];
const BLOCKERS: readonly string[] = ['concepto', 'sintaxis', 'enfoque', 'datos', 'tiempo'];
const ID = /^[A-Za-z0-9_-]{3,64}$/;
const MAX_TEXT = 20_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v);

const done = <T>(errors: string[], value: T): Checked<T> => (errors.length > 0 ? { ok: false, errors } : { ok: true, value });

export const isApoyo = (v: unknown): v is Apoyo => typeof v === 'string' && APOYOS.includes(v);

export function checkEvidence(value: unknown, challengeId: string, stageIds: ReadonlySet<string>): Checked<Evidence> {
  if (!isRecord(value)) return { ok: false, errors: ['El registro debe ser un objeto.'] };
  const e: string[] = [];
  if (typeof value.id !== 'string' || !ID.test(value.id)) e.push('`id` debe ser un texto de 3 a 64 caracteres (letras, números, - y _).');
  if (value.challengeId !== challengeId) e.push(`\`challengeId\` debe ser «${challengeId}».`);
  if (typeof value.stageId !== 'string' || !stageIds.has(value.stageId)) e.push(`\`stageId\` no pertenece a ${challengeId}.`);
  if (!isIso(value.at)) e.push('`at` debe ser una fecha ISO 8601.');
  if (typeof value.result !== 'string' || !RESULTS.includes(value.result)) e.push('`result` debe ser aprobada, parcial o fallida.');
  if (typeof value.withHelp !== 'boolean') e.push('`withHelp` debe ser verdadero o falso.');
  if (!isApoyo(value.apoyo)) e.push('`apoyo` debe ser guiado, pistas o autonomo.');
  if (typeof value.actualMinutes !== 'number' || !Number.isFinite(value.actualMinutes) || value.actualMinutes < 0 || value.actualMinutes > 24 * 60) e.push('`actualMinutes` debe ser un número entre 0 y 1440.');
  if (value.timeSource !== undefined && value.timeSource !== 'cronometro' && value.timeSource !== 'manual') e.push('`timeSource` debe ser cronometro o manual.');
  if (value.blocker !== undefined && (typeof value.blocker !== 'string' || !BLOCKERS.includes(value.blocker))) e.push('`blocker` no es válido.');
  if (value.notes !== undefined && (typeof value.notes !== 'string' || value.notes.length > MAX_TEXT)) e.push('`notes` debe ser un texto de hasta 20 000 caracteres.');
  const allowed = new Set(['id', 'challengeId', 'stageId', 'at', 'result', 'withHelp', 'apoyo', 'actualMinutes', 'timeSource', 'blocker', 'notes']);
  for (const k of Object.keys(value)) if (!allowed.has(k)) e.push(`Campo desconocido: \`${k}\`.`);
  return done(e, value as unknown as Evidence);
}

export function checkBusinessAnswers(value: unknown, challengeId: string, questionIds: ReadonlySet<string>): Checked<BusinessAnswer[]> {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, errors: ['`answers` debe ser una lista con al menos una respuesta.'] };
  const e: string[] = [];
  value.forEach((a, i) => {
    const at = `answers[${i}]`;
    if (!isRecord(a)) return void e.push(`${at}: debe ser un objeto.`);
    if (typeof a.id !== 'string' || !ID.test(a.id)) e.push(`${at}: \`id\` no es válido.`);
    if (a.challengeId !== challengeId) e.push(`${at}: \`challengeId\` debe ser «${challengeId}».`);
    if (typeof a.questionId !== 'string' || !questionIds.has(a.questionId)) e.push(`${at}: \`questionId\` no pertenece a ${challengeId}.`);
    if (!isIso(a.at)) e.push(`${at}: \`at\` debe ser una fecha ISO 8601.`);
    if (typeof a.text !== 'string' || a.text.trim() === '' || a.text.length > MAX_TEXT) e.push(`${at}: \`text\` debe ser un texto no vacío de hasta 20 000 caracteres.`);
  });
  return done(e, value as BusinessAnswer[]);
}

export function checkTestResults(value: unknown, challengeId: string, questions: ReadonlyMap<string, { conceptId: string }>): Checked<TestResult[]> {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, errors: ['`results` debe ser una lista con al menos un resultado.'] };
  const e: string[] = [];
  value.forEach((r, i) => {
    const at = `results[${i}]`;
    if (!isRecord(r)) return void e.push(`${at}: debe ser un objeto.`);
    if (typeof r.id !== 'string' || !ID.test(r.id)) e.push(`${at}: \`id\` no es válido.`);
    if (r.challengeId !== challengeId) e.push(`${at}: \`challengeId\` debe ser «${challengeId}».`);
    const q = typeof r.questionId === 'string' ? questions.get(r.questionId) : undefined;
    if (!q) e.push(`${at}: \`questionId\` no pertenece al test de ${challengeId}.`);
    else if (r.conceptId !== q.conceptId) e.push(`${at}: \`conceptId\` debe ser «${q.conceptId}».`);
    if (r.bloom !== 1 && r.bloom !== 2 && r.bloom !== 3) e.push(`${at}: \`bloom\` debe ser 1, 2 o 3.`);
    if (!isIso(r.at)) e.push(`${at}: \`at\` debe ser una fecha ISO 8601.`);
    if (typeof r.correct !== 'boolean') e.push(`${at}: \`correct\` debe ser verdadero o falso.`);
  });
  return done(e, value as TestResult[]);
}
