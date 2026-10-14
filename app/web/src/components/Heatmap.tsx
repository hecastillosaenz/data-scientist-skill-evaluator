import type { HeatCell } from '../domain/analytics';
import { formatLongDate } from '../charts/format';
import styles from './Heatmap.module.css';

const LEVEL_TEXT = ['sin práctica', '1 intento', '2 intentos', '3 intentos', '4 o más intentos'];
const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Mapa de actividad por día: columnas = semanas (lunes a domingo), 4 niveles de intensidad más el vacío. */
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  // Pocos días → celdas grandes con el número del día; muchos días → celdas compactas.
  const size = cells.length <= 7 ? 44 : cells.length <= 30 ? 36 : 22;
  const showDay = cells.length <= 30;
  const first = cells[0];
  const lead = first ? (first.day.getDay() + 6) % 7 : 0;
  const slots: (HeatCell | null)[] = [...Array.from({ length: lead }, () => null), ...cells];

  return (
    <div>
      <div className={styles.wrap} style={{ ['--cell' as string]: `${size}px` }}>
        <div className={styles.head} aria-hidden="true">
          {HEAD.map((h) => <span key={h}>{h}</span>)}
        </div>
        <div className={styles.grid} role="img" aria-label={`Actividad de los últimos ${cells.length} días`}>
          {slots.map((cell, i) =>
            cell ? (
              <span
                key={cell.key}
                className={`${styles.cell} ${styles[`l${cell.level}`]}`}
                title={`${formatLongDate(cell.day)}: ${LEVEL_TEXT[cell.level]}`}
              >
                {showDay ? cell.day.getDate() : null}
              </span>
            ) : (
              <span key={`e${i}`} className={styles.pad} />
            ),
          )}
        </div>
      </div>
      <p className={styles.legend}>
        Menos
        {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`${styles.cell} ${styles[`l${l}`]}`} title={LEVEL_TEXT[l]} />)}
        Más
      </p>
    </div>
  );
}
