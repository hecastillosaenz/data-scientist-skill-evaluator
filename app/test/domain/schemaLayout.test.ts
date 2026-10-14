import { describe, expect, it } from 'vitest';
import { CARD_W, describeEdge, layoutSchema } from '../../web/src/domain/schemaLayout';
import { buildChallenges } from '../../web/src/data/sample/challenges';
import type { TableDef } from '../../shared/types';

const t = (name: string, cols: TableDef['columns']): TableDef => ({ name, columns: cols, rowCount: 0, sampleRows: [] });

const polizas = t('polizas', [{ name: 'id', type: 'integer', pk: true }, { name: 'tipo', type: 'varchar' }]);
const siniestros = t('siniestros', [
  { name: 'id', type: 'integer', pk: true },
  { name: 'poliza_id', type: 'integer', fk: { table: 'polizas', column: 'id' } },
]);

describe('layoutSchema', () => {
  it('pone la tabla referenciada a la izquierda de quien la referencia', () => {
    // el orden de entrada no debe importar
    for (const tables of [[polizas, siniestros], [siniestros, polizas]]) {
      const { nodes } = layoutSchema(tables);
      const x = Object.fromEntries(nodes.map((n) => [n.table.name, n.x]));
      expect(x.polizas!).toBeLessThan(x.siniestros!);
    }
  });

  it('crea una arista por llave foránea, anclada en la fila de la columna', () => {
    const layout = layoutSchema([polizas, siniestros]);
    expect(layout.edges).toHaveLength(1);
    const e = layout.edges[0]!;
    expect(e).toMatchObject({ from: 'siniestros', fromColumn: 'poliza_id', to: 'polizas', toColumn: 'id' });
    const from = layout.nodes.find((n) => n.table.name === 'siniestros')!;
    const to = layout.nodes.find((n) => n.table.name === 'polizas')!;
    expect(e.x1).toBe(from.x); // sale por el borde izquierdo de la tabla con la FK
    expect(e.x2).toBe(to.x + CARD_W); // llega al borde derecho de la referenciada
    expect(e.y1).toBeGreaterThan(from.y);
    expect(e.y1).toBeLessThan(from.y + from.h);
  });

  it('ninguna tarjeta se solapa con otra', () => {
    const tables = [polizas, siniestros, t('a', [{ name: 'id', type: 'int', pk: true }]), t('b', [{ name: 'id', type: 'int', pk: true }, { name: 'a_id', type: 'int', fk: { table: 'a', column: 'id' } }])];
    const { nodes } = layoutSchema(tables);
    for (const a of nodes) {
      for (const b of nodes) {
        if (a === b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('tolera autorreferencias y ciclos sin colgarse', () => {
    const self = t('empleados', [{ name: 'id', type: 'int', pk: true }, { name: 'jefe_id', type: 'int', fk: { table: 'empleados', column: 'id' } }]);
    expect(layoutSchema([self]).edges[0]!.self).toBe(true);
    const a = t('a', [{ name: 'id', type: 'int', pk: true }, { name: 'b_id', type: 'int', fk: { table: 'b', column: 'id' } }]);
    const b = t('b', [{ name: 'id', type: 'int', pk: true }, { name: 'a_id', type: 'int', fk: { table: 'a', column: 'id' } }]);
    expect(layoutSchema([a, b]).nodes).toHaveLength(2);
  });

  it('es determinista y describe las relaciones en texto', () => {
    const one = layoutSchema([polizas, siniestros]);
    const two = layoutSchema([polizas, siniestros]);
    expect(one).toEqual(two);
    expect(describeEdge(one.edges[0]!)).toBe('poliza_id de siniestros referencia a polizas.id (muchos a uno)');
  });

  it('todos los challenges de ejemplo se pueden dibujar', () => {
    for (const c of buildChallenges()) {
      if (!c.data) continue;
      const layout = layoutSchema(c.data.tables);
      expect(layout.nodes).toHaveLength(c.data.tables.length);
      expect(layout.width).toBeGreaterThan(0);
    }
  });
});
