import { useState } from 'react';
import { Loader2, TriangleAlert, X } from 'lucide-react';
import { useApp } from '../data/DataContext';
import styles from './Notices.module.css';

/**
 * Avisos persistentes arriba del contenido: guardado fallido (R37), progreso ilegible (R33), challenge inválido (R29)
 * y el estado del Analista (R12, R42): trabajando en segundo plano o con registros sin analizar.
 */
export function Notices() {
  const { notices, actions, analysis, source } = useApp();
  const [busy, setBusy] = useState(false);
  const [hidePending, setHidePending] = useState(false);
  const pending = analysis.pending.length;
  const failed = Object.values(analysis.failed);
  const showPending = source === 'real' && pending > 0 && !analysis.running && !hidePending;
  const showRunning = source === 'real' && analysis.running;

  if (notices.length === 0 && !showPending && !showRunning) return null;
  return (
    <div className={styles.stack} role="region" aria-label="Avisos">
      {showRunning && (
        <div className={`${styles.notice} ${styles.info}`} role="status">
          <Loader2 size={18} strokeWidth={1.5} className={styles.spin} aria-hidden="true" />
          <div className={styles.text}>
            <strong>El Analista está revisando tus notas</strong>
            <p>Trabaja en segundo plano: puedes seguir con la siguiente etapa.</p>
          </div>
        </div>
      )}
      {showPending && (
        <div className={`${styles.notice} ${styles.warning}`} role="status">
          <TriangleAlert size={18} strokeWidth={1.5} aria-hidden="true" />
          <div className={styles.text}>
            <strong>{pending} {pending === 1 ? 'registro sin analizar' : 'registros sin analizar'}</strong>
            <p>{failed.length > 0 ? `El último análisis falló: ${failed[0]}` : 'El Analista aún no los ha revisado. Tus registros están guardados y no cambian.'}</p>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await actions.analyzePending();
                setBusy(false);
              }}
            >
              {busy ? 'Analizando…' : 'Analizar ahora'}
            </button>
          </div>
          <button type="button" className={styles.close} aria-label="Cerrar aviso de registros sin analizar" onClick={() => setHidePending(true)}>
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      )}
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
