import { useState } from 'react';
import { Pause, Pencil, Play } from 'lucide-react';
import { BLOCKER_LABEL } from '../../../../shared/domains';
import type { Blocker, Stage } from '../../../../shared/types';
import { Card, StickyPanel } from '../../components/cards';
import { FilterChip } from '../../components/FilterChip';
import { useTimekeeper } from '../../data/TimekeeperContext';
import type { StageResult } from '../../domain/simulate';
import { formatClock, toMinutes } from '../../domain/timekeeper';
import styles from './StageLogPanel.module.css';

export interface RegisterPayload {
  actualMinutes: number;
  timeSource: 'cronometro' | 'manual';
  blocker?: Blocker;
  notes?: string;
}

interface Props {
  stage: Stage;
  result: StageResult | null;
  /** Registrar crea un Evidence nuevo (R10); nunca sobrescribe. */
  onRegister: (payload: RegisterPayload) => Promise<boolean>;
}

const BLOCKERS = Object.keys(BLOCKER_LABEL) as Blocker[];

/**
 * «Registro de la etapa» (sustituye a «Entrega»): la resolución ocurre en el notebook de VS Code (HU5),
 * así que aquí solo se registra cómo fue: tiempo real (la vuelta del cronómetro global, R20), dónde te trabaste y notas (HU9).
 */
export function StageLogPanel({ stage, result, onRegister }: Props) {
  // Se remonta al cambiar de etapa (key en el padre), así los campos arrancan limpios por etapa.
  const { running, lap, takeLap, start, pause } = useTimekeeper();
  const [manual, setManual] = useState<number | null>(null);
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const measured = toMinutes(lap);
  const minutes = manual ?? measured;
  const canRegister = !!result && minutes > 0;

  return (
    <StickyPanel label="Registro de la etapa activa">
      <Card className={styles.card}>
        <div>
          <h2>Registro · Etapa {stage.number}</h2>
          <p className={styles.sub}>{stage.title}</p>
        </div>

        <div className={styles.lap}>
          <div className={styles.lapHead}>
            <p className="field-label">Tiempo de esta etapa</p>
            <button type="button" className={`btn btn-sm ${running ? '' : 'btn-primary'}`} onClick={running ? pause : start}>
              {running ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
              {running ? 'Pausar' : lap > 0 ? 'Reanudar' : 'Iniciar'}
            </button>
          </div>
          <p className={`${styles.lapClock} mono`} role="timer" aria-live="off">{formatClock(lap)}</p>
          <div className={styles.track} aria-hidden="true"><span style={{ width: `${Math.round(Math.min(1, lap / (stage.estimatedMinutes * 60_000)) * 100)}%` }} /></div>
          <p className={styles.hint}>
            Objetivo <span className="mono">{stage.estimatedMinutes} min</span>
            {lap > stage.estimatedMinutes * 60_000 && <> · <span className="mono">+{Math.max(1, Math.round((lap - stage.estimatedMinutes * 60_000) / 60_000))} min</span> sobre el objetivo</>}
            {' · '}es el tiempo desde tu último registro, del cronómetro global.
          </p>
        </div>

        <div className={styles.timeRow}>
          <div>
            <p className="field-label">Tiempo que se registrará</p>
            {manual === null ? (
              <p className={`${styles.minutes} mono`}>{minutes > 0 ? `${minutes} min` : 'Sin medir'}</p>
            ) : (
              <input
                aria-label="Tiempo real en minutos (manual)"
                className={`${styles.field} mono`}
                type="number"
                min={1}
                value={manual}
                onChange={(e) => setManual(Math.max(1, Number(e.target.value) || 1))}
              />
            )}
          </div>
          {manual === null ? (
            <button type="button" className="btn btn-sm" onClick={() => setManual(Math.max(1, measured))}>
              <Pencil size={14} aria-hidden="true" /> Editar
            </button>
          ) : (
            <button type="button" className="btn btn-sm" onClick={() => setManual(null)}>Usar cronómetro</button>
          )}
        </div>
        {manual !== null && <p className={styles.hint}>Tiempo editado a mano: el registro quedará marcado como manual.</p>}

        <fieldset className={styles.fieldset}>
          <legend>¿Dónde te trabaste?</legend>
          <div className={styles.chips}>
            {BLOCKERS.map((b) => (
              <FilterChip key={b} active={blocker === b} onClick={() => setBlocker(blocker === b ? null : b)}>
                {BLOCKER_LABEL[b]}
              </FilterChip>
            ))}
          </div>
        </fieldset>

        <div className={styles.notes}>
          <label className="field-label" htmlFor="stage-notes">Notas libres</label>
          <textarea id="stage-notes" className={styles.field} rows={3} placeholder="¿Qué te costó? Alimenta tu grafo de conocimiento." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!canRegister || saving}
          onClick={async () => {
            setSaving(true);
            const ok = await onRegister({
              actualMinutes: minutes,
              timeSource: manual === null ? 'cronometro' : 'manual',
              ...(blocker ? { blocker } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            });
            setSaving(false);
            // Si el guardado falló (R37) no se toma la vuelta ni se limpia nada: puedes reintentar sin perder lo escrito.
            if (!ok) return;
            // Toma la vuelta: la siguiente etapa empieza a contar desde aquí (el reloj global no se reinicia).
            takeLap();
            setSaved(true);
          }}
        >
          {saving ? 'Guardando…' : 'Registrar etapa'}
        </button>
        {!canRegister && (
          <p className={styles.hint}>
            {!result ? 'Verifica o evalúa la etapa antes de registrarla.' : 'Inicia el cronómetro global o edita el tiempo para registrarla.'}
          </p>
        )}
        {saved && (
          <p className={styles.saved} role="status">
            Etapa registrada como un intento nuevo. Los anteriores se conservan.
          </p>
        )}
      </Card>
    </StickyPanel>
  );
}
