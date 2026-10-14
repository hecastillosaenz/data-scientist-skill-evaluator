import { TriangleAlert, X } from 'lucide-react';
import { useApp } from '../data/DataContext';
import styles from './Notices.module.css';

/** Avisos persistentes arriba del contenido: guardado fallido (R37), progreso ilegible (R33), challenge inválido (R29). */
export function Notices() {
  const { notices, actions } = useApp();
  if (notices.length === 0) return null;
  return (
    <div className={styles.stack} role="region" aria-label="Avisos">
      {notices.map((n) => (
        <div key={n.id} className={`${styles.notice} ${n.kind === 'error' ? styles.error : styles.warning}`} role={n.kind === 'error' ? 'alert' : 'status'}>
          <TriangleAlert size={18} strokeWidth={1.5} aria-hidden="true" />
          <div className={styles.text}>
            <strong>{n.title}</strong>
            <p>{n.detail}</p>
          </div>
          <button type="button" className={styles.close} aria-label={`Cerrar aviso: ${n.title}`} onClick={() => actions.dismissNotice(n.id)}>
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
