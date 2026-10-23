import type { Bloom, Concept } from '../../shared/types';
import { PLAN_MAX_PASOS, type PlanFoco } from '../../shared/objetivos';

export class PlanInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanInvalidError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Valida lo que propone el Planificador (R56) y lo vuelve un plan: todo `conceptId` debe existir en el grafo, el nivel
 * de Bloom es de 1 a 6 y no hay repetidos. El orden lo fija el orquestador: un prerrequisito elegido va siempre antes
 * que lo que lo necesita (orden topológico estable respecto al orden propuesto).
 */
export function buildPlan(proposal: unknown, concepts: readonly Concept[], now: string): PlanFoco {
  if (!isRecord(proposal) || !Array.isArray(proposal.pasos)) throw new PlanInvalidError('La respuesta debe ser un objeto con `resumen` y la lista `pasos`.');
  if (proposal.pasos.length === 0) throw new PlanInvalidError('`pasos` está vacío: propón al menos un concepto del grafo.');
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const pasos: PlanFoco['pasos'] = [];
  const problems: string[] = [];
  proposal.pasos.slice(0, PLAN_MAX_PASOS).forEach((p, i) => {
    if (!isRecord(p) || typeof p.conceptId !== 'string') return void problems.push(`pasos[${i}] debe traer \`conceptId\`.`);
    if (!byId.has(p.conceptId)) return void problems.push(`pasos[${i}]: «${p.conceptId}» no existe en el grafo; usa un id exacto de la lista.`);
    if (seen.has(p.conceptId)) return; // un repetido se descarta en silencio: no cambia el sentido del plan
    seen.add(p.conceptId);
    const bloom = Number(p.bloom);
    if (!Number.isInteger(bloom) || bloom < 1 || bloom > 6) return void problems.push(`pasos[${i}] («${p.conceptId}»): \`bloom\` debe ser un entero de 1 a 6.`);
    const porque = typeof p.porque === 'string' ? p.porque.trim().slice(0, 500) : '';
    if (porque === '') return void problems.push(`pasos[${i}] («${p.conceptId}»): falta \`porque\`.`);
    pasos.push({ conceptId: p.conceptId, bloom: bloom as Bloom, porque });
  });
  if (problems.length > 0) throw new PlanInvalidError(problems.slice(0, 5).join(' '));

  // Prerrequisitos (transitivos, dentro de lo elegido) antes que lo que los necesita.
  const chosen = new Set(pasos.map((p) => p.conceptId));
  const needs = (id: string, visiting = new Set<string>()): Set<string> => {
    const out = new Set<string>();
    for (const pre of byId.get(id)?.prerequisites ?? []) {
      if (visiting.has(pre)) continue;
      if (chosen.has(pre)) out.add(pre);
      visiting.add(pre);
      for (const x of needs(pre, visiting)) out.add(x);
    }
    return out;
  };
  const deps = new Map(pasos.map((p) => [p.conceptId, needs(p.conceptId)]));
  const ordered: PlanFoco['pasos'] = [];
  const placed = new Set<string>();
  const pending = [...pasos];
  while (pending.length > 0) {
    const i = pending.findIndex((p) => [...deps.get(p.conceptId)!].every((d) => placed.has(d) || d === p.conceptId));
    const [next] = pending.splice(i === -1 ? 0 : i, 1);
    ordered.push(next!);
    placed.add(next!.conceptId);
  }
  const resumen = typeof proposal.resumen === 'string' ? proposal.resumen.trim().slice(0, 800) : '';
  return { estado: 'propuesto', creadoAt: now, resumen, pasos: ordered };
}
