import { describe, expect, it } from 'vitest';
import { activeCount, addFoco, isDirty, newFocoId, removeFoco, updateFoco } from '../../web/src/domain/objetivosDraft';
import type { Objetivos } from '../../shared/objetivos';

const base: Objetivos = { version: 1, rol: 'DS', focos: [] };

describe('borrador de objetivos (R44)', () => {
  it('genera ids sin tildes ni símbolos y sin chocar', () => {
    expect(newFocoId('Certificación: Cálculo para DL', new Set())).toBe('certificacion-calculo-para-dl');
    expect(newFocoId('Cálculo', new Set(['calculo']))).toBe('calculo-2');
    expect(newFocoId('¿¡!?', new Set())).toBe('foco');
  });

  it('un foco nuevo es activo mientras quepa y queda en pausa al llegar al máximo', () => {
    let o = base;
    for (const t of ['A', 'B', 'C', 'D']) o = addFoco(o, t, 3);
    expect(o.focos.map((f) => f.estado)).toEqual(['activo', 'activo', 'activo', 'pausado']);
    expect(activeCount(o)).toBe(3);
  });

  it('actualiza y elimina solo el foco indicado, sin mutar el original', () => {
    const o = addFoco(addFoco(base, 'A', 3), 'B', 3);
    const next = updateFoco(o, 'a', { material: 'notas' });
    expect(next.focos[0]!.material).toBe('notas');
    expect(o.focos[0]!.material).toBe('');
    expect(removeFoco(next, 'a').focos.map((f) => f.id)).toEqual(['b']);
  });

  it('detecta cambios por contenido', () => {
    const o = addFoco(base, 'A', 3);
    expect(isDirty(o, structuredClone(o))).toBe(false);
    expect(isDirty(o, updateFoco(o, 'a', { titulo: 'Otro' }))).toBe(true);
  });
});
