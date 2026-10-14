import { useState } from 'react';
import { BLOCKER_LABEL } from '../../../../shared/domains';
import type { Blocker, Stage } from '../../../../shared/types';
import { Card, StickyPanel } from '../../components/cards';
import { FilterChip } from '../../components/FilterChip';
import { Segmented } from '../../components/Segmented';
import type { StageResult } from '../../domain/simulate';
import styles from './DeliveryPanel.module.css';

type Format = 'pegar' | 'subir' | 'enlace';

const FORMATS: { value: Format; label: string }[] = [
  { value: 'pegar', label: 'Pegar' },
  { value: 'subir', label: 'Subir' },
  { value: 'enlace', label: 'Enlace' },
];

export interface RegisterPayload {
  actualMinutes: number;
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

export function DeliveryPanel({ stage, result, onRegister }: Props) {
  // Se remonta al cambiar de etapa (key en el padre), así los campos arrancan limpios por etapa.
  const [format, setFormat] = useState<Format>('pegar');
  const [minutes, setMinutes] = useState(stage.estimatedMinutes);
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  return (
    <StickyPanel label="Entrega de la etapa activa">
      <Card className={styles.card}>
        <h2>Entrega · Etapa {stage.number}</h2>
        <p className={styles.sub}>{stage.title}</p>

        <Segmented label="Formato de entrega" options={FORMATS} value={format} onChange={setFormat} />
        {format === 'pegar' && <textarea className={styles.field} rows={4} placeholder="Pega aquí tu código o respuesta" aria-label="Contenido de la entrega" />}
        {format === 'subir' && <input className={styles.field} type="file" aria-label="Subir archivo de la entrega" />}
        {format === 'enlace' && <input className={styles.field} type="url" placeholder="https://…" aria-label="Enlace de la entrega" />}

        <label className={styles.label} htmlFor="real-min">Tiempo real (min)</label>
        <input
          id="real-min"
          className={`${styles.field} mono`}
          type="number"
          min={1}
          value={minutes}
          onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
        />

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

        <label className={styles.label} htmlFor="notes">Notas libres</label>
        <textarea id="notes" className={styles.field} rows={3} placeholder="¿Qué te costó? Alimenta tu grafo de conocimiento." value={notes} onChange={(e) => setNotes(e.target.value)} />

        <button
          type="button"
          className="btn btn-primary"
          disabled={!result}
          onClick={() => {
            onRegister({ actualMinutes: minutes, ...(blocker ? { blocker } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) });
            setSaved(true);
          }}
        >
          Registrar etapa
        </button>
        {!result && <p className={styles.hint}>Verifica o evalúa la etapa antes de registrarla.</p>}
        {saved && (
          <p className={styles.saved} role="status">
            Etapa registrada como un intento nuevo. Los anteriores se conservan.
          </p>
        )}
      </Card>
    </StickyPanel>
  );
}
