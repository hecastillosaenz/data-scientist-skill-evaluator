import type { Bloom, ConceptState, Difficulty, StageStatus } from '../../../shared/types';
import { BLOOM_LABEL, CONCEPT_STATE_LABEL, DIFFICULTY_LABEL, STAGE_STATUS_LABEL } from '../../../shared/domains';
import styles from './chips.module.css';

export function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`${styles.chip} ${styles[`d${difficulty}`]}`}>
      <span className={styles.bars} aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <i key={n} className={n <= difficulty ? styles.on : ''} style={{ height: 4 + n * 2 }} />
        ))}
      </span>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}

export function BloomChip({ bloom }: { bloom: Bloom }) {
  return (
    <span className={`${styles.chip} ${styles.neutral}`} title={`Nivel cognitivo de Bloom ${bloom}`}>
      <span className="mono">B{bloom}</span> {BLOOM_LABEL[bloom]}
    </span>
  );
}

export function TimeChip({ minutes }: { minutes: number }) {
  return <span className={`${styles.chip} ${styles.neutral} mono`}>{minutes} min</span>;
}

const TONE: Record<StageStatus | ConceptState, string> = {
  pendiente: 'no',
  no_visto: 'no',
  en_curso: 'mid',
  visto: 'mid',
  completada: 'ok',
  dominado: 'ok',
  con_fallos: 'fail',
};

/** El color siempre va acompañado de texto (UI-UX §1.4). */
export function StatusChip({ state, kind = 'stage' }: { state: StageStatus | ConceptState; kind?: 'stage' | 'concept' }) {
  const label = kind === 'concept' ? CONCEPT_STATE_LABEL[state as ConceptState] : STAGE_STATUS_LABEL[state as StageStatus];
  return (
    <span className={`${styles.chip} ${styles.status}`}>
      <i className={`${styles.dot} ${styles[`tone_${TONE[state]}`]}`} aria-hidden="true" />
      {label ?? state}
    </span>
  );
}
