import type { StageStatus } from '../../../shared/types';
import styles from './StageBar.module.css';

interface Props {
  statuses: StageStatus[];
  /** Ancho de cada segmento en px: 18 (tabla) / 28 (preview) / 32 (detalle) / 'flex' (tarjeta oscura). */
  segment?: 18 | 28 | 32 | 'flex';
  onDark?: boolean;
  hideText?: boolean;
}

/** Un segmento de 6px de alto por etapa; siempre con texto "N de M etapas completas" (UI-UX §2). */
export function StageBar({ statuses, segment = 18, onDark = false, hideText = false }: Props) {
  const done = statuses.filter((s) => s === 'completada').length;
  const text = `${done} de ${statuses.length} etapas completas`;
  return (
    <div className={`${styles.wrap} ${onDark ? styles.dark : ''}`}>
      <div className={styles.bar} role="img" aria-label={text}>
        {statuses.map((s, i) => (
          <span
            key={i}
            className={`${styles.seg} ${styles[s]}`}
            style={segment === 'flex' ? { flex: 1 } : { width: segment }}
          />
        ))}
      </div>
      {!hideText && <span className={`${styles.text} mono`}>{text}</span>}
    </div>
  );
}
