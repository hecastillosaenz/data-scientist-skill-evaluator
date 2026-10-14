import { useEffect, useId, useRef, useState } from 'react';
import { Link, useMatch } from 'react-router';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { useApp } from '../data/DataContext';
import { useTimekeeper, useTimerOverview } from '../data/TimekeeperContext';
import { formatClock } from '../domain/timekeeper';
import styles from './GlobalTimer.module.css';

/**
 * Píldora del cronómetro (R20), fija arriba a la derecha. Cada challenge tiene el suyo: en Challenge actual muestra el
 * de ese challenge; en otras pantallas, el que está en marcha (con enlace a su challenge) o el del challenge actual.
 */
export function GlobalTimer() {
  const { data, currentChallenge } = useApp();
  const { runningId } = useTimerOverview();
  const viewing = useMatch('/challenge-actual/:id?');
  const viewedId = viewing ? (viewing.params.id ?? currentChallenge?.id ?? null) : null;
  const shownId = viewedId ?? runningId ?? currentChallenge?.id ?? null;
  if (!shownId) return null;
  const challenge = data?.challenges.find((c) => c.id === shownId);
  return <ChallengeTimer key={shownId} challengeId={shownId} title={challenge?.title ?? shownId} linked={shownId !== viewedId} />;
}

function ChallengeTimer({ challengeId, title, linked }: { challengeId: string; title: string; linked: boolean }) {
  const { running, elapsed, lap, start, pause, reset } = useTimekeeper(challengeId);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className={`${styles.wrap} ${running ? styles.on : ''}`}>
      <div className={styles.pill} role="group" aria-label={`Cronómetro de ${title}`}>
        <button type="button" className={styles.clockBtn} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
          <Timer size={15} strokeWidth={1.75} aria-hidden="true" />
          <span className={`${styles.clock} mono`} role="timer" aria-live="off">{formatClock(elapsed)}</span>
          <span className="visually-hidden">{running ? 'en marcha' : 'en pausa'}</span>
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={running ? pause : start}
          aria-label={running ? 'Pausar el cronómetro' : elapsed > 0 ? 'Reanudar el cronómetro' : 'Iniciar el cronómetro'}
        >
          {running ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div id={menuId} className={styles.menu} role="dialog" aria-label="Detalle del cronómetro">
          <p className={styles.owner}>
            {linked ? <Link to={`/challenge-actual/${challengeId}`} onClick={() => setOpen(false)}>{title}</Link> : title}
          </p>
          <dl>
            <div><dt>Estado</dt><dd>{running ? 'En marcha' : 'En pausa'}</dd></div>
            <div><dt>Tiempo total</dt><dd className="mono">{formatClock(elapsed)}</dd></div>
            <div><dt>Esta vuelta</dt><dd className="mono">{formatClock(lap)}</dd></div>
          </dl>
          <p>La vuelta es el tiempo desde el último «Registrar etapa» de este challenge: es lo que se asigna a la etapa que registres.</p>
          <p>Investigar y leer teoría no cuentan: inicia el cronómetro cuando empieces a resolver. No se pausa si sales de la app, pero iniciar el de otro challenge sí lo pausa.</p>
          {confirming ? (
            <div className={styles.confirm}>
              <span>¿Reiniciar este cronómetro a 00:00?</span>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { reset(); setConfirming(false); setOpen(false); }}>Sí, reiniciar</button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="btn btn-sm" disabled={elapsed === 0} onClick={() => setConfirming(true)}>
              <RotateCcw size={14} aria-hidden="true" /> Reiniciar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
