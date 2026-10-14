import { Pause, Play, RotateCcw } from 'lucide-react';
import { formatClock } from '../domain/timekeeper';
import { useTimekeeper } from '../data/TimekeeperContext';
import styles from './TimerControl.module.css';

interface Props {
  stageId: string;
  /** Tiempo objetivo de la etapa, en minutos. */
  targetMinutes: number;
  /** `bar` para el cuerpo de la etapa; `large` para el panel lateral. */
  variant?: 'bar' | 'large';
}

/** Cronómetro de una etapa: mm:ss, Iniciar/Pausar/Reiniciar y avance frente al objetivo (R20). */
export function TimerControl({ stageId, targetMinutes, variant = 'bar' }: Props) {
  const { running, elapsed, start, pause, reset } = useTimekeeper();
  const ms = elapsed(stageId);
  const isRunning = running === stageId;
  const targetMs = targetMinutes * 60_000;
  const over = ms - targetMs;
  const pct = Math.min(1, ms / targetMs);

  return (
    <div className={`${styles.wrap} ${variant === 'large' ? styles.large : ''}`} role="group" aria-label="Cronómetro de la etapa">
      <div className={styles.row}>
        <span className={`${styles.clock} mono`} role="timer" aria-live="off" aria-label={`Tiempo transcurrido ${formatClock(ms)}`}>
          {formatClock(ms)}
        </span>
        <button type="button" className={`btn btn-sm ${isRunning ? '' : 'btn-primary'}`} onClick={() => (isRunning ? pause(stageId) : start(stageId))}>
          {isRunning ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          {isRunning ? 'Pausar' : ms > 0 ? 'Reanudar' : 'Iniciar'}
        </button>
        {ms > 0 && (
          <button type="button" className={`btn btn-sm ${styles.reset}`} onClick={() => reset(stageId)} aria-label="Reiniciar cronómetro">
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={styles.track} aria-hidden="true">
        <span style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
      <p className={styles.caption}>
        Objetivo <span className="mono">{targetMinutes} min</span>
        {over > 0 && <> · <span className="mono">+{Math.max(1, Math.round(over / 60_000))} min</span> sobre el objetivo</>}
        {isRunning && ' · corriendo'}
      </p>
    </div>
  );
}
