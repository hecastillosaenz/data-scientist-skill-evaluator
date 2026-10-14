import { Check, Loader2, OctagonX, Square, X } from 'lucide-react';
import { Markdown } from '../../components/Markdown';
import type { VerifyState } from '../../domain/verifyState';
import styles from './VerificationPanel.module.css';

interface Props {
  state: VerifyState;
  /** Challenge de ejemplo: la verificación es simulada. */
  simulated: boolean;
  onCancel: () => void;
  onRetry: () => void;
}

const RESULT_TEXT = { aprobada: 'Correcta', parcial: 'Parcial', fallida: 'No pasó' } as const;
const PHASE_TEXT = { running: 'En curso', done: 'Terminó', error: 'Con error', cancelled: 'Cancelada' } as const;

/**
 * Ventana de verificación (SDD R26): línea de tiempo en vivo de lo que hace el sistema, la salida de tu celda,
 * el feedback del Evaluador y el resultado. Aparece debajo del botón de verificar.
 */
export function VerificationPanel({ state, simulated, onCancel, onRetry }: Props) {
  const running = state.phase === 'running';
  const stderr = state.output.filter((o) => o.stream === 'stderr');
  return (
    <section className={styles.panel} aria-label="Verificación" aria-live="polite" aria-busy={running}>
      <header className={styles.head}>
        <h3>Verificación</h3>
        <span className={`${styles.phase} ${styles[state.phase]}`}>{running && <Loader2 size={13} className={styles.spin} aria-hidden="true" />}{PHASE_TEXT[state.phase]}</span>
        <div className={styles.actions}>
          {running ? (
            <button type="button" className="btn btn-sm" onClick={onCancel}><Square size={12} aria-hidden="true" /> Detener</button>
          ) : (
            <button type="button" className="btn btn-sm" onClick={onRetry}>Reintentar</button>
          )}
        </div>
      </header>

      <ol className={styles.steps}>
        {state.steps.map((s) => (
          <li key={s.id} className={`${styles.step} ${styles[`step_${s.status}`]}`}>
            <span className={styles.icon} aria-hidden="true">
              {s.status === 'running' ? <Loader2 size={14} className={styles.spin} /> : s.status === 'ok' ? <Check size={14} strokeWidth={2.25} /> : <X size={14} strokeWidth={2.25} />}
            </span>
            <span className={styles.stepText}>
              <span className={styles.label}>{s.label}</span>
              {s.detail && <span className={styles.detail}>{s.detail}</span>}
              <span className="visually-hidden">{s.status === 'running' ? ' (en curso)' : s.status === 'ok' ? ' (listo)' : ' (falló)'}</span>
            </span>
          </li>
        ))}
        {running && state.steps.length === 0 && <li className={styles.step}><span className={styles.icon}><Loader2 size={14} className={styles.spin} aria-hidden="true" /></span><span className={styles.label}>Iniciando…</span></li>}
      </ol>

      {state.tools.length > 0 && (
        <ul className={`${styles.tools} mono`} aria-label="Archivos que lee el Evaluador">
          {state.tools.map((t, i) => <li key={`${t}-${i}`}>→ {t}</li>)}
        </ul>
      )}

      {state.output.length > 0 && (
        <details className={styles.output} open={stderr.length > 0}>
          <summary>Salida de tu celda{stderr.length > 0 ? ' · con errores' : ''}</summary>
          {state.output.map((o, i) => (
            <pre key={i} className={`${styles.pre} ${o.stream === 'stderr' ? styles.stderr : ''} mono`}>{o.text}</pre>
          ))}
        </details>
      )}

      {state.feedback.length > 0 && (
        <div className={styles.feedback}>
          <h4>Feedback del Evaluador</h4>
          {state.feedback.map((f, i) => <Markdown key={i}>{f}</Markdown>)}
        </div>
      )}

      {state.error && state.phase === 'error' && (
        <div className={styles.errorBox} role="alert">
          <OctagonX size={16} aria-hidden="true" />
          <p>{state.error.message}</p>
        </div>
      )}
      {state.phase === 'cancelled' && <p className={styles.cancelled}>Verificación cancelada. No se registró nada.</p>}

      {state.result && (
        <div className={`${styles.result} ${styles[`res_${state.result.status}`]}`} role="status">
          <strong>{RESULT_TEXT[state.result.status]}</strong>
          <p>{state.result.summary}</p>
          <p className={styles.hint}>Resultado listo: regístralo con «Registrar etapa» en la columna lateral.</p>
        </div>
      )}

      {simulated && <p className={styles.sim}>Datos de ejemplo: esta verificación es simulada. Los challenges reales ejecutan tu notebook y llaman al Evaluador.</p>}
    </section>
  );
}
