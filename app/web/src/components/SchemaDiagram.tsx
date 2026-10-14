import { useState } from 'react';
import { KeyRound, Link2 } from 'lucide-react';
import type { TableDef } from '../../../shared/types';
import { CARD_W, HEAD_H, ROW_H, describeEdge, layoutSchema, type SchemaEdge } from '../domain/schemaLayout';
import styles from './SchemaDiagram.module.css';

const curve = (e: SchemaEdge): string => {
  if (e.self) {
    const x = e.x1 + 34;
    return `M${e.x1},${e.y1} C${x},${e.y1} ${x},${e.y2 + 18} ${e.x2},${e.y2 + 12}`;
  }
  const dx = Math.max(40, (e.x1 - e.x2) / 2);
  return `M${e.x1},${e.y1} C${e.x1 - dx},${e.y1} ${e.x2 + dx},${e.y2} ${e.x2},${e.y2}`;
};

/** Diagrama relacional: tarjetas de tabla con llaves y conectores FK→PK con cardinalidad 1–N. */
export function SchemaDiagram({ tables }: { tables: TableDef[] }) {
  const layout = layoutSchema(tables);
  const [active, setActive] = useState<string | null>(null);
  const related = (e: SchemaEdge) => active !== null && (e.from === active || e.to === active);

  if (tables.length === 0) return null;

  return (
    <figure className={styles.figure}>
      <div className={styles.scroll}>
        <svg
          className={styles.svg}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-label={`Diagrama relacional con ${tables.length} ${tables.length === 1 ? 'tabla' : 'tablas'} y ${layout.edges.length} ${layout.edges.length === 1 ? 'relación' : 'relaciones'}`}
        >
          <g>
            {layout.edges.map((e) => (
              <g key={e.id} className={`${styles.edge} ${related(e) ? styles.edgeOn : ''}`} style={{ opacity: active === null || related(e) ? 1 : 0.25 }}>
                <path d={curve(e)} />
                <text x={e.x1 - 12} y={e.y1 - 6} className={styles.card1}>N</text>
                <text x={e.x2 + 6} y={e.y2 - 6} className={styles.card1}>1</text>
              </g>
            ))}
          </g>
          {layout.nodes.map(({ table, x, y, h }) => (
            <g
              key={table.name}
              transform={`translate(${x},${y})`}
              style={{ opacity: active === null || active === table.name || layout.edges.some((e) => related(e) && (e.from === table.name || e.to === table.name)) ? 1 : 0.5 }}
              onPointerEnter={() => setActive(table.name)}
              onPointerLeave={() => setActive(null)}
            >
              <rect className={styles.card} width={CARD_W} height={h} rx={12} />
              <path className={styles.head} d={`M0,${HEAD_H} V12 a12,12 0 0 1 12,-12 H${CARD_W - 12} a12,12 0 0 1 12,12 V${HEAD_H} Z`} />
              <text className={styles.tableName} x={14} y={HEAD_H / 2 + 5}>{table.name}</text>
              <text className={styles.rowCount} x={CARD_W - 14} y={HEAD_H / 2 + 4} textAnchor="end">{table.rowCount > 0 ? `${table.rowCount} filas` : ''}</text>
              {table.columns.map((col, i) => {
                const cy = HEAD_H + i * ROW_H;
                return (
                  <g key={col.name} transform={`translate(0,${cy})`}>
                    {i > 0 && <line className={styles.rowLine} x1={12} x2={CARD_W - 12} y1={0} y2={0} />}
                    <text className={styles.colName} x={34} y={ROW_H / 2 + 4}>{col.name}</text>
                    <text className={styles.colType} x={CARD_W - 14} y={ROW_H / 2 + 4} textAnchor="end">{col.type}</text>
                    {col.pk && <KeyRound x={12} y={ROW_H / 2 - 7} width={14} height={14} className={styles.pk} strokeWidth={1.75} />}
                    {col.fk && !col.pk && <Link2 x={12} y={ROW_H / 2 - 7} width={14} height={14} className={styles.fk} strokeWidth={1.75} />}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <figcaption>
        <ul className={styles.legend} aria-label="Leyenda del diagrama">
          <li><KeyRound size={14} strokeWidth={1.75} className={styles.pk} aria-hidden="true" /> Llave primaria</li>
          <li><Link2 size={14} strokeWidth={1.75} className={styles.fk} aria-hidden="true" /> Llave foránea</li>
          <li><span className="mono">N → 1</span> muchos a uno</li>
        </ul>
        {layout.edges.length > 0 ? (
          <ul className="visually-hidden">{layout.edges.map((e) => <li key={e.id}>{describeEdge(e)}</li>)}</ul>
        ) : (
          <p className={styles.noRel}>Las tablas de este challenge no se relacionan entre sí.</p>
        )}
      </figcaption>
    </figure>
  );
}
