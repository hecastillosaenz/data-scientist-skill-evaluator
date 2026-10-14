import { Link } from 'react-router';
import { CONCEPT_STATE_LABEL, DIFFICULTY_LABEL, DOMAIN_BY_ID } from '../../../../shared/domains';
import type { Challenge, Concept, ConceptState, Evidence } from '../../../../shared/types';
import { BloomChip, StatusChip } from '../../components/chips';
import { Card, StickyPanel } from '../../components/cards';
import { DomainTile } from '../../components/DomainTile';
import type { ConceptInsight } from '../../domain/conceptState';
import { relatedConcepts, stagesForConcept } from '../../domain/graphQueries';
import { formatShortDate } from '../../charts/format';
import styles from './GraphPanel.module.css';

const STATES: ConceptState[] = ['dominado', 'visto', 'con_fallos', 'no_visto'];
const RESULT_TEXT = { aprobada: 'Aprobada', parcial: 'Parcial', fallida: 'Fallida' } as const;

interface Props {
  concepts: Concept[];
  challenges: Challenge[];
  evidence: Evidence[];
  insights: Map<string, ConceptInsight>;
  selected: Concept | null;
  onSelect: (id: string) => void;
}

export function GraphPanel({ concepts, challenges, evidence, insights, selected, onSelect }: Props) {
  if (!selected) {
    const counts = new Map<ConceptState, number>();
    for (const c of concepts) {
      const s = insights.get(c.id)?.state ?? 'no_visto';
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return (
      <StickyPanel label="Detalle del concepto">
        <Card className={styles.panel}>
          <h2>Selecciona un concepto</h2>
          <p className={styles.muted}>Haz clic en un nodo del grafo, o búscalo por nombre, para ver su evidencia y sus prerrequisitos.</p>
          <ul className={styles.counts}>
            {STATES.map((s) => (
              <li key={s}>
                <StatusChip state={s} kind="concept" />
                <span className="mono">{counts.get(s) ?? 0}</span>
              </li>
            ))}
          </ul>
        </Card>
      </StickyPanel>
    );
  }

  const insight = insights.get(selected.id);
  const state = insight?.state ?? 'no_visto';
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const stages = stagesForConcept(selected.id, challenges);
  const stageIds = new Set(stages.map((s) => s.stage.id));
  const attempts = evidence
    .filter((e) => stageIds.has(e.stageId))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  const stageRef = new Map(stages.map((s) => [s.stage.id, s]));
  const related = relatedConcepts(selected, concepts, challenges, 8);

  return (
    <StickyPanel label="Detalle del concepto">
      <Card className={styles.panel}>
        <div className={styles.head}>
          <DomainTile domain={selected.domain} variant="color" />
          <div>
            <p className={styles.domain}>{DOMAIN_BY_ID[selected.domain].name}</p>
            <h2>{selected.name}</h2>
          </div>
        </div>

        <dl className={styles.facts}>
          <div><dt>Estado</dt><dd><StatusChip state={state} kind="concept" /></dd></div>
          <div><dt>Nivel actual</dt><dd>{insight?.level ? DIFFICULTY_LABEL[insight.level] : '—'}</dd></div>
          <div><dt>Bloom máximo con evidencia</dt><dd>{insight?.maxBloom ? <BloomChip bloom={insight.maxBloom} /> : '—'}</dd></div>
        </dl>

        <section>
          <h3>Prerrequisitos</h3>
          {selected.prerequisites.length === 0 ? (
            <p className={styles.muted}>Es un concepto de base: no tiene prerrequisitos.</p>
          ) : (
            <ul className={styles.links}>
              {selected.prerequisites.map((id) => {
                const c = byId.get(id);
                if (!c) return null;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => onSelect(id)}>
                      <DomainTile domain={c.domain} size={22} />
                      <span>{c.name}</span>
                      <span className={styles.state}>{CONCEPT_STATE_LABEL[insights.get(id)?.state ?? 'no_visto']}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3>Challenges y etapas relacionadas</h3>
          {stages.length === 0 ? (
            <p className={styles.muted}>Ninguna etapa practica este concepto todavía.</p>
          ) : (
            <ul className={styles.plain}>
              {stages.map(({ stage, challenge }) => (
                <li key={stage.id}>
                  <Link to={`/challenge-actual/${challenge.id}`}>Etapa {stage.number} · {stage.title}</Link>
                  <span className={styles.muted}>{challenge.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Evidencias</h3>
          {attempts.length === 0 ? (
            <p className={styles.muted}>Sin evidencia: aún no has practicado este concepto.</p>
          ) : (
            <ul className={styles.plain}>
              {attempts.map((e) => (
                <li key={e.id}>
                  <span>
                    <span className="mono">{formatShortDate(new Date(e.at))}</span> · {RESULT_TEXT[e.result]}
                    {e.withHelp ? ' · Con ayuda' : ''}
                  </span>
                  <span className={styles.muted}>Etapa {stageRef.get(e.stageId)?.stage.number} · {stageRef.get(e.stageId)?.stage.title}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Conceptos relacionados</h3>
          {related.length === 0 ? (
            <p className={styles.muted}>Sin relaciones registradas.</p>
          ) : (
            <ul className={styles.chips}>
              {related.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => onSelect(c.id)}>
                    <DomainTile domain={c.domain} size={18} />
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>
    </StickyPanel>
  );
}
