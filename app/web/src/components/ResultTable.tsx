import type { ExpectedTable } from '../../../shared/types';
import styles from './ResultTable.module.css';

/** Tabla de resultado esperado (columnas + filas), en mono y con números alineados a la derecha. */
export function ResultTable({ table }: { table: ExpectedTable }) {
  return (
    <div className={styles.wrap}>
      <table className={`${styles.table} mono`}>
        <thead>
          <tr>{table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={typeof cell === 'number' ? styles.num : ''}>
                  {cell === null ? <span className={styles.null}>NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
