import { useId, useState } from 'react';
import { Check, Copy, KeyRound, Link2 } from 'lucide-react';
import type { Cell, Dataset, TableDef } from '../../../shared/types';
import styles from './DataPreview.module.css';

const show = (value: Cell) =>
  value === null ? <span className={styles.null}>NULL</span> : typeof value === 'boolean' ? String(value) : value;

function TableView({ table }: { table: TableDef }) {
  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} mono`}>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.name} scope="col">
                <span className={styles.th}>
                  {c.pk && <KeyRound size={12} strokeWidth={1.75} aria-label="llave primaria" />}
                  {c.fk && !c.pk && <Link2 size={12} strokeWidth={1.75} aria-label="llave foránea" />}
                  {c.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.sampleRows.length === 0 ? (
            <tr><td colSpan={table.columns.length} className={styles.empty}>Sin filas de muestra para esta tabla.</td></tr>
          ) : (
            table.sampleRows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j} className={typeof cell === 'number' ? styles.num : ''}>{show(cell)}</td>)}</tr>
            ))
          )}
        </tbody>
      </table>
      <p className={styles.caption}>
        {table.sampleRows.length} de {table.rowCount || table.sampleRows.length} filas{table.description ? ` · ${table.description}` : ''}
      </p>
    </div>
  );
}

/** Pestañas por tabla con las filas de muestra y «Copiar SQL» del seed. */
export function DataPreview({ data }: { data: Dataset }) {
  const [current, setCurrent] = useState(data.tables[0]?.name ?? '');
  const [copied, setCopied] = useState(false);
  const id = useId();
  const table = data.tables.find((t) => t.name === current) ?? data.tables[0];
  const seed = data.seedSql ?? data.seedPython;

  const copy = async () => {
    if (!seed) return;
    try {
      await navigator.clipboard.writeText(seed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* sin permiso de portapapeles: el seed sigue visible en la pestaña de código */
    }
  };

  if (!table) return null;
  return (
    <div>
      <div className={styles.bar}>
        <div role="tablist" aria-label="Tablas del challenge" className={styles.tabs}>
          {data.tables.map((t) => (
            <button
              key={t.name}
              type="button"
              role="tab"
              id={`${id}-${t.name}`}
              aria-selected={t.name === table.name}
              aria-controls={`${id}-panel`}
              className={`${styles.tab} mono ${t.name === table.name ? styles.active : ''}`}
              onClick={() => setCurrent(t.name)}
            >
              {t.name}
            </button>
          ))}
        </div>
        {seed && (
          <button type="button" className="btn btn-sm" onClick={copy}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copiado' : data.seedSql ? 'Copiar SQL' : 'Copiar código'}
          </button>
        )}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${table.name}`}>
        <TableView table={table} />
      </div>
    </div>
  );
}
