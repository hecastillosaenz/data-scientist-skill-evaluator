import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { BLOCKER_LABEL } from '../../../../shared/domains';
import type { Blocker, Stage } from '../../../../shared/types';
import { Card, StickyPanel } from '../../components/cards';
import { FilterChip } from '../../components/FilterChip';
import { TimerControl } from '../../components/TimerControl';
import { useTimekeeper } from '../../data/TimekeeperContext';
import type { StageResult } from '../../domain/simulate';
import { toMinutes } from '../../domain/timekeeper';
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
  onRegister: (payload: RegisterPayload) => void;
}

const BLOCKERS = Object.keys(BLOCKER_LABEL) as Blocker[];

/**
 * «Registro de la etapa» (sustituye a «Entrega»): la resolución ocurre en el notebook de VS Code (HU5),
 * así que aquí solo se registra cómo fue: tiempo real (cronómetro, R20), dónde te trabaste y notas (HU9).
 */
export function StageLogPanel({ stage, result, onRegister }: Props) {
  // Se remonta al cambiar de etapa (key en el padre), así los campos arrancan limpios por etapa.
  const { elapsed, reset } = useTimekeeper();
  const [manual, setManual] = useState<number | null>(null);
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  const measured = toMinutes(elapsed(stage.id));
  const minutes = manual ?? measured;
  const canRegister = !!result && minutes > 0;

  return (
    <StickyPanel label="Registro de la etapa activa">
      <Card className={styles.card}>
        <div>
          <h2>Registro · Etapa {stage.number}</h2>
          <p className={styles.sub}>{stage.title}</p>
        </div>

        <TimerControl stageId={stage.id} targetMinutes={stage.estimatedMinutes} variant="large" />

        <div className={styles.timeRow}>
          <div>
            <p className="field-label">Tiempo real</p>
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
          disabled={!canRegister}
          onClick={() => {
            onRegister({
              actualMinutes: minutes,
              timeSource: manual === null ? 'cronometro' : 'manual',
              ...(blocker ? { blocker } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            });
            reset(stage.id);
            setSaved(true);
          }}
        >
          Registrar etapa
        </button>
        {!canRegister && (
          <p className={styles.hint}>
            {!result ? 'Verifica o evalúa la etapa antes de registrarla.' : 'Inicia el cronómetro o edita el tiempo para registrarla.'}
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
