import { useEffect, useRef } from 'react';
import { Clock3 } from 'lucide-react';
import { useTimekeeper } from '../data/TimekeeperContext';
import { formatClock } from '../domain/timekeeper';
import styles from './GapDialog.module.css';

const hhmm = (t: number) => new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

/** Lo que dura una ausencia, en palabras: «47 min» o «1 h 12 min». */
export function describeGap(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Diálogo de ausencia (R30): si el cronómetro corría y la app dejó de dar señal (pestaña cerrada, equipo suspendido),
 * pregunta qué hacer con ese intervalo. Nunca lo suma en silencio; lo recomendado es no contarlo.
 */
export function GapDialog() {
  const { gap, resolveGap, elapsed } = useTimekeeper();
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (gap) first.current?.focus();
  }, [gap]);

  if (!gap) return null;
  const duration = gap.to - gap.from;
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="gap-title" aria-describedby="gap-desc">
        <span className={styles.icon} aria-hidden="true"><Clock3 size={20} strokeWidth={1.75} /></span>
        <h2 id="gap-title">El cronómetro estuvo corriendo mientras no estabas</h2>
        <p id="gap-desc">
          La app no dio señal durante <strong>{describeGap(duration)}</strong> (de {hhmm(gap.from)} a {hhmm(gap.to)}): se cerró la pestaña o el equipo se
          suspendió. El cronómetro quedó congelado en <span className="mono">{formatClock(elapsed)}</span>. ¿Qué hacemos con ese tiempo?
        </p>
        <div className={styles.actions}>
          <button ref={first} type="button" className="btn btn-primary" onClick={() => resolveGap('descartar')}>
            No contarlo y seguir
            <span className={styles.rec}>Recomendado</span>
          </button>
          <button type="button" className="btn" onClick={() => resolveGap('contar')}>Contarlo ({describeGap(duration)}) y seguir</button>
          <button type="button" className="btn" onClick={() => resolveGap('pausar')}>No contarlo y dejarlo en pausa</button>
        </div>
        <p className={styles.note}>Si estuviste resolviendo en VS Code con la app cerrada, elige «Contarlo». Si te levantaste, el tiempo ausente no debería sumar.</p>
      </div>
    </div>
  );
}
