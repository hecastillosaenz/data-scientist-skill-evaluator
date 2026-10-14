import { Link } from 'react-router';
import { Timer } from 'lucide-react';
import { useApp } from '../data/DataContext';
import { useTimekeeper } from '../data/TimekeeperContext';
import { formatClock } from '../domain/timekeeper';
import styles from './RunningTimerChip.module.css';

/** Chip global cuando hay un cronómetro corriendo: enlaza a la etapa para pausarlo o registrarla. */
export function RunningTimerChip() {
  const { running, elapsed } = useTimekeeper();
  const { data } = useApp();
  if (!running) return null;
  const stage = data?.challenges.flatMap((c) => c.stages).find((s) => s.id === running);
  const challengeId = running.split('-s')[0];
  return (
    <Link to={`/challenge-actual/${challengeId}`} className={styles.chip} aria-label={`Cronómetro en marcha: ${formatClock(elapsed(running))}${stage ? `, etapa ${stage.number}` : ''}`}>
      <Timer size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className="mono">{formatClock(elapsed(running))}</span>
      {stage && <span className={styles.label}>Etapa {stage.number} · {stage.title}</span>}
    </Link>
  );
}
