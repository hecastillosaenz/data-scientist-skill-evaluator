import type { Concept } from '../../shared/types';

/** Normaliza para comparar sin tildes ni mayúsculas. */
export const norm = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'por', 'para', 'en', 'y', 'con', 'un', 'una', 'al', 'a', 'e', 'o', 'que', 'sobre', 'mi', 'mis']);

const tokens = (text: string): string[] =>
  norm(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0 && !STOP.has(t));

export type TemaResolution =
  | { status: 'unica'; matches: Concept[] }
  | { status: 'varias'; matches: Concept[] }
  | { status: 'ninguna'; matches: [] };

/**
 * Resuelve un tema de texto libre contra el grafo (SDD R43), sin agente y de forma determinista: un concepto cuyo
 * nombre o id contiene todas las palabras significativas del tema. Un nombre exacto gana siempre. Con varias
 * coincidencias devuelve las más cercanas (nombre más corto primero) para que el usuario elija.
 */
export function resolveTema(texto: string, concepts: Concept[], limit = 6): TemaResolution {
  const query = norm(texto);
  if (query === '' || texto.length > 120) return { status: 'ninguna', matches: [] };
  const exact = concepts.filter((c) => norm(c.name) === query || norm(c.id) === query);
  if (exact.length === 1) return { status: 'unica', matches: exact };

  const words = tokens(texto);
  if (words.length === 0) return { status: 'ninguna', matches: [] };
  const hits = concepts
    .map((c) => {
      const hay = new Set(tokens(`${c.name} ${c.id}`));
      // Cada palabra del tema debe estar en el concepto, completa o como prefijo («gradiente» ↔ «gradient»).
      const all = words.every((w) => hay.has(w) || [...hay].some((h) => h.startsWith(w) || (w.length >= 5 && w.startsWith(h) && h.length >= 5)));
      return { c, all, extra: hay.size - words.length };
    })
    .filter((h) => h.all)
    .sort((a, b) => a.extra - b.extra || a.c.name.localeCompare(b.c.name, 'es') || a.c.id.localeCompare(b.c.id));
  const matches = hits.slice(0, limit).map((h) => h.c);
  if (matches.length === 0) return { status: 'ninguna', matches: [] };
  // La mejor coincidencia es única cuando es la más cercana por claridad: solo una con el menor exceso de palabras.
  const best = hits[0]!.extra;
  const bests = hits.filter((h) => h.extra === best);
  if (bests.length === 1 && hits.length === 1) return { status: 'unica', matches };
  return { status: 'varias', matches };
}

/** Id nuevo para un concepto creado por el usuario: `dominio:slug`, sin chocar con los existentes (R43). */
export function newConceptId(domain: string, name: string, existing: ReadonlySet<string>): string {
  const slug = norm(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'concepto';
  let id = `${domain}:${slug}`;
  for (let n = 2; existing.has(id); n++) id = `${domain}:${slug}-${n}`;
  return id;
}
