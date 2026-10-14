import { copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DOMAINS } from '../../shared/domains';
import type { Candidate, Concept, Observation } from '../../shared/types';
import { writeFileAtomic } from '../atomic-write';
import { configDir } from '../paths';

/** Contenido de `configuracion-retos/knowledge-graph.json` (S5): el catálogo de Concepts con sus prerrequisitos. */
export interface GraphFile {
  version: 1;
  concepts: Concept[];
  /** Una observación del Analista por Evidence procesada (R41). */
  observations?: Observation[];
  /** Temas sin cubrir que esperan una segunda Evidence para convertirse en concepto (R41). */
  candidates?: Candidate[];
}

/** El archivo existe pero no es legible o no cumple el formato (R35): se informa y no se toca. */
export class GraphError extends Error {
  constructor(readonly errors: string[]) {
    super(`knowledge-graph.json no es válido: ${errors[0] ?? 'formato desconocido'}${errors.length > 1 ? ` (y ${errors.length - 1} errores más)` : ''}`);
    this.name = 'GraphError';
  }
}

const DOMAIN_IDS = new Set<string>(DOMAINS.map((d) => d.id));
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateGraph(value: unknown): { ok: true; graph: GraphFile } | { ok: false; errors: string[] } {
  if (!isRecord(value)) return { ok: false, errors: ['La raíz debe ser un objeto con `version` y `concepts`.'] };
  const errors: string[] = [];
  if (value.version !== 1) errors.push('`version` debe ser 1.');
  if (!Array.isArray(value.concepts)) return { ok: false, errors: [...errors, '`concepts` debe ser una lista.'] };

  const ids = new Set<string>();
  value.concepts.forEach((c, i) => {
    const at = `concepts[${i}]`;
    if (!isRecord(c) || typeof c.id !== 'string' || c.id === '') return void errors.push(`${at}: falta \`id\` (texto).`);
    if (ids.has(c.id)) errors.push(`${at}: el id «${c.id}» está repetido.`);
    ids.add(c.id);
    if (typeof c.name !== 'string' || c.name === '') errors.push(`${at} («${c.id}»): falta \`name\`.`);
    if (typeof c.domain !== 'string' || !DOMAIN_IDS.has(c.domain)) errors.push(`${at} («${c.id}»): \`domain\` debe ser uno de ${[...DOMAIN_IDS].join(', ')}.`);
    if (!Array.isArray(c.prerequisites) || c.prerequisites.some((p) => typeof p !== 'string')) errors.push(`${at} («${c.id}»): \`prerequisites\` debe ser una lista de ids.`);
  });
  for (const c of value.concepts as Concept[]) {
    if (!isRecord(c) || !Array.isArray(c.prerequisites)) continue;
    for (const p of c.prerequisites) if (typeof p === 'string' && !ids.has(p)) errors.push(`«${c.id}»: el prerrequisito «${p}» no existe en el catálogo.`);
  }
  if (errors.length === 0) {
    const cycle = findCycle(value.concepts as Concept[]);
    if (cycle) errors.push(`Los prerrequisitos forman un ciclo: ${cycle.join(' → ')}.`);
  }

  if (value.observations !== undefined) {
    if (!Array.isArray(value.observations)) errors.push('`observations` debe ser una lista.');
    else {
      const seen = new Set<string>();
      value.observations.forEach((o, i) => {
        const at = `observations[${i}]`;
        if (!isRecord(o) || typeof o.evidenceId !== 'string' || o.evidenceId === '') return void errors.push(`${at}: falta \`evidenceId\`.`);
        if (seen.has(o.evidenceId)) errors.push(`${at}: la Evidence «${o.evidenceId}» tiene más de una observación.`);
        seen.add(o.evidenceId);
        if (!['ok', 'omitida', 'sin_hallazgos'].includes(o.status as string)) errors.push(`${at}: \`status\` no es válido.`);
        if (typeof o.diagnosis !== 'string' || o.diagnosis.length > 300) errors.push(`${at}: \`diagnosis\` debe ser un texto de hasta 300 caracteres.`);
        if (typeof o.at !== 'string') errors.push(`${at}: falta \`at\`.`);
        if (!Array.isArray(o.conceptIds) || o.conceptIds.some((c) => typeof c !== 'string' || !ids.has(c))) errors.push(`${at}: \`conceptIds\` debe listar conceptos existentes.`);
      });
    }
  }
  if (value.candidates !== undefined) {
    if (!Array.isArray(value.candidates)) errors.push('`candidates` debe ser una lista.');
    else {
      value.candidates.forEach((c, i) => {
        const at = `candidates[${i}]`;
        if (!isRecord(c) || typeof c.label !== 'string' || c.label === '') return void errors.push(`${at}: falta \`label\`.`);
        if (typeof c.domain !== 'string' || !DOMAIN_IDS.has(c.domain)) errors.push(`${at}: \`domain\` no es válido.`);
        if (!Array.isArray(c.evidenceIds) || c.evidenceIds.some((e) => typeof e !== 'string')) errors.push(`${at}: \`evidenceIds\` debe ser una lista de ids.`);
      });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, graph: value as unknown as GraphFile };
}

/** Primer ciclo de prerrequisitos que encuentre (como lista de ids cerrada), o `null` si el grafo es acíclico. */
export function findCycle(concepts: Pick<Concept, 'id' | 'prerequisites'>[]): string[] | null {
  const byId = new Map(concepts.map((c) => [c.id, c.prerequisites]));
  const state = new Map<string, 1 | 2>(); // 1 = en la pila, 2 = terminado
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    stack.push(id);
    for (const next of byId.get(id) ?? []) {
      if (!byId.has(next)) continue;
      if (state.get(next) === 1) return [...stack.slice(stack.indexOf(next)), next];
      if (!state.has(next)) {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const c of concepts) if (!state.has(c.id)) {
    const found = visit(c.id);
    if (found) return found;
  }
  return null;
}

export const graphPath = (repoRoot: string): string => path.join(configDir(repoRoot), 'knowledge-graph.json');

/** Lee y valida el catálogo. Un archivo ausente equivale a un catálogo vacío; uno corrupto lanza `GraphError` y no se modifica. */
export async function readGraph(repoRoot: string): Promise<GraphFile> {
  let text: string;
  try {
    text = await readFile(graphPath(repoRoot), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, concepts: [] };
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GraphError(['no es un JSON válido.']);
  }
  const result = validateGraph(json);
  if (!result.ok) throw new GraphError(result.errors);
  return result.graph;
}

/** Escritura atómica (S6). Valida antes de escribir para no dejar nunca un catálogo inválido. */
export async function writeGraph(repoRoot: string, graph: GraphFile, options: { backup?: boolean } = {}): Promise<void> {
  const result = validateGraph(graph);
  if (!result.ok) throw new GraphError(result.errors);
  // R42: antes de cada escritura del Analista, la copia de seguridad (`.prev`, ignorada por git).
  if (options.backup) await copyFile(graphPath(repoRoot), `${graphPath(repoRoot)}.prev`).catch((err: NodeJS.ErrnoException) => {
    if (err.code !== 'ENOENT') throw err;
  });
  await writeFileAtomic(graphPath(repoRoot), `${JSON.stringify(graph, null, 2)}\n`);
}
