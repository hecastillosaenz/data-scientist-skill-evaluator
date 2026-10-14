import { CircleCheck, Target } from 'lucide-react';
import type { ChallengeObjectives } from '../../../shared/types';
import { Markdown } from './Markdown';
import styles from './ObjectivesBlock.module.css';

/** Objetivos del reto (R28): qué busca, qué tendrás al terminar y qué habilidades entrena. */
export function ObjectivesBlock({ objectives }: { objectives: ChallengeObjectives }) {
  return (
    <section className={styles.block} aria-label="Objetivo del reto">
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true"><Target size={18} strokeWidth={1.75} /></span>
        <h2>Objetivo del reto</h2>
      </header>

      <div className={styles.cols}>
        <div className={styles.col}>
          <h3>Qué busca este reto</h3>
          <Markdown>{objectives.lookingFor}</Markdown>
        </div>
        <div className={styles.col}>
          <h3>Al terminar tendrás</h3>
          <ul className={styles.outcomes}>
            {objectives.outcomes.map((o) => (
              <li key={o}>
                <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                <Markdown inline>{o}</Markdown>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {objectives.skills.length > 0 && (
        <div className={styles.skills}>
          <h3>Habilidades que entrena</h3>
          <ul>
            {objectives.skills.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
