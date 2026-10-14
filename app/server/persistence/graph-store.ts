import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DOMAINS } from '../../shared/domains';
import type { Concept } from '../../shared/types';
import { writeFileAtomic } from '../atomic-write';
import { configDir } from '../paths';

/** Contenido de `configuracion-retos/knowledge-graph.json` (S5): el catálogo de Concepts con sus prerrequisitos. */
export interface GraphFile {
  version: 1;
  concepts: Concept[];
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
  return errors.length > 0 ? { ok: false, errors } : { ok: true, graph: value as unknown as GraphFile };
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
export async function writeGraph(repoRoot: string, graph: GraphFile): Promise<void> {
  const result = validateGraph(graph);
  if (!result.ok) throw new GraphError(result.errors);
  await writeFileAtomic(graphPath(repoRoot), `${JSON.stringify(graph, null, 2)}\n`);
}
