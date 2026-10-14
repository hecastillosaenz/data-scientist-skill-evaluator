import type { Foco, Objetivos } from '../../../shared/objetivos';

/** Id nuevo para un foco: minúsculas y guiones, sin chocar con los existentes. */
export function newFocoId(titulo: string, existing: ReadonlySet<string>): string {
  const slug = titulo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'foco';
  let id = slug;
  for (let n = 2; existing.has(id); n++) id = `${slug}-${n}`;
  return id;
}

export const activeCount = (o: Objetivos): number => o.focos.filter((f) => f.estado === 'activo').length;

/** Foco nuevo: activo si queda hueco, pausado si ya se alcanzó el máximo (R44). */
export function addFoco(o: Objetivos, titulo: string, max: number): Objetivos {
  const id = newFocoId(titulo, new Set(o.focos.map((f) => f.id)));
  const foco: Foco = { id, titulo, estado: activeCount(o) < max ? 'activo' : 'pausado', conceptIds: [], material: '' };
  return { ...o, focos: [...o.focos, foco] };
}

export const updateFoco = (o: Objetivos, id: string, patch: Partial<Foco>): Objetivos => ({
  ...o,
  focos: o.focos.map((f) => (f.id === id ? { ...f, ...patch } : f)),
});

export const removeFoco = (o: Objetivos, id: string): Objetivos => ({ ...o, focos: o.focos.filter((f) => f.id !== id) });

/** ¿Hay cambios sin guardar? Compara el contenido, no la identidad. */
export const isDirty = (a: Objetivos, b: Objetivos): boolean => JSON.stringify(a) !== JSON.stringify(b);
