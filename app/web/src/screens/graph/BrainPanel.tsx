import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { CONCEPT_STATE_LABEL, DIFFICULTY_LABEL, DOMAIN_BY_ID, STAGE_STATUS_LABEL } from '../../../../shared/domains';
import type { Challenge, ChallengeStatus, ConceptState } from '../../../../shared/types';
import { Card, StickyPanel } from '../../components/cards';
import { DifficultyChip, StatusChip } from '../../components/chips';
import { DomainTile } from '../../components/DomainTile';
import { BRAIN_KINDS, KIND_LABEL, KIND_LABEL_SINGULAR, neighborsOf, type BrainEdgeKind, type BrainGraph, type BrainKind, type BrainNode } from '../../domain/brainGraph';
import { PRIORITY_LABEL, REASON_LABEL } from '../../domain/reviewQueue';
import styles from './BrainPanel.module.css';

const CHALLENGE_STATUS: Record<ChallengeStatus, string> = { en_curso: 'En curso', pendiente: 'Pendiente', completada: 'Completada' };
const RELATION: Record<BrainEdgeKind, { out: string; in: string }> = {
  prerequisito: { out: 'Es prerrequisito de', in: 'Requiere' },
  contiene: { out: 'Etapas', in: 'Pertenece a' },
  practica: { out: 'Practica', in: 'Lo practican' },
  evalua: { out: 'Evalúa', in: 'Lo evalúan' },
  cierra: { out: 'Cierra con', in: 'Cierra el challenge' },
  mejora: { out: 'Mejora', in: 'Mejoras abiertas' },
};

interface Props {
  graph: BrainGraph;
  node: BrainNode | null;
  challenges: Challenge[];
  onSelect: (id: string) => void;
}

/** Detalle del nodo seleccionado: qué es, su estado, a qué se conecta y a dónde ir. */
export function BrainPanel({ graph, node, challenges, onSelect }: Props) {
  if (!node) {
    const counts = new Map<BrainKind, number>();
    for (const n of graph.nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    return (
      <StickyPanel label="Detalle del nodo">
        <Card className={styles.panel}>
          <h2>Tu second brain</h2>
          <p className={styles.muted}>
            Aquí conviven tus conceptos, los challenges que los practican, sus etapas, los tests y las mejoras pendientes.
            Selecciona cualquier nodo para ver cómo se conecta.
          </p>
          <ul className={styles.counts}>
            {BRAIN_KINDS.map((k) => (
              <li key={k}><span>{KIND_LABEL[k]}</span><span className="mono">{counts.get(k) ?? 0}</span></li>
            ))}
          </ul>
          <p className={styles.muted}>{graph.edges.length} relaciones entre {graph.nodes.length} nodos.</p>
        </Card>
      </StickyPanel>
    );
  }

  const neighbors = neighborsOf(graph, node.id);
  const groups = new Map<string, { title: string; nodes: BrainNode[] }>();
  for (const { node: other, edge, direction } of neighbors) {
    const title = RELATION[edge.kind][direction];
    const key = `${edge.kind}:${direction}`;
    const entry = groups.get(key) ?? { title, nodes: [] };
    entry.nodes.push(other);
    groups.set(key, entry);
  }
  const challenge = challenges.find((c) => c.id === (node.challengeId ?? (node.kind === 'challenge' ? node.ref : '')));

  return (
    <StickyPanel label="Detalle del nodo">
      <Card className={styles.panel}>
        <div className={styles.head}>
          {node.domain && <DomainTile domain={node.domain} variant="color" />}
          <div>
            <p className={styles.kind}>{KIND_LABEL_SINGULAR[node.kind]}{node.domain ? ` · ${DOMAIN_BY_ID[node.domain].name}` : ''}</p>
            <h2>{node.label}</h2>
          </div>
        </div>

        <dl className={styles.facts}>
          {node.kind === 'concept' && <Fact label="Estado"><StatusChip state={node.conceptState as ConceptState} kind="concept" /></Fact>}
          {node.kind === 'stage' && node.status && <Fact label="Estado"><StatusChip state={node.status as keyof typeof STAGE_STATUS_LABEL} /></Fact>}
          {node.kind === 'challenge' && node.status && <Fact label="Estado">{CHALLENGE_STATUS[node.status as ChallengeStatus]}</Fact>}
          {node.kind === 'challenge' && challenge && <Fact label="Dificultad"><DifficultyChip difficulty={challenge.difficulty} /></Fact>}
          {node.kind === 'test' && <Fact label="Último resultado">{node.score ?? 'Pendiente'}</Fact>}
          {node.kind === 'mejora' && node.reason && <Fact label="Motivo">{REASON_LABEL[node.reason]}</Fact>}
          {node.kind === 'mejora' && node.priority && <Fact label="Prioridad">{PRIORITY_LABEL[node.priority]}</Fact>}
          {node.kind === 'concept' && <Fact label="Conexiones">{neighbors.length}</Fact>}
        </dl>

        {[...groups.values()].map((g) => (
          <section key={g.title}>
            <h3>{g.title} <span className={`${styles.count} mono`}>{g.nodes.length}</span></h3>
            <ul className={styles.links}>
              {g.nodes.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => onSelect(n.id)}>
                    {n.domain ? <DomainTile domain={n.domain} size={22} /> : <span className={styles.kindMark} aria-hidden="true">{KIND_LABEL_SINGULAR[n.kind].slice(0, 1)}</span>}
                    <span>{n.label}</span>
                    {n.kind === 'concept' && <span className={styles.state}>{CONCEPT_STATE_LABEL[n.conceptState ?? 'no_visto']}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {g.nodes.length > 8 && <p className={styles.more}>y {g.nodes.length - 8} más</p>}
          </section>
        ))}

        <div className={styles.go}>
          {node.kind === 'concept' && <Link className="btn btn-sm" to={`/grafo?concepto=${encodeURIComponent(node.ref)}`}>Ver en el grafo de conceptos <ArrowRight size={14} aria-hidden="true" /></Link>}
          {node.kind === 'mejora' && <Link className="btn btn-sm btn-primary" to={`/debilidad/${encodeURIComponent(node.ref)}`}>Ver el análisis <ArrowRight size={14} aria-hidden="true" /></Link>}
          {(node.kind === 'challenge' || node.kind === 'stage' || node.kind === 'test') && challenge && (
            <Link className="btn btn-sm btn-primary" to={`/challenge-actual/${challenge.id}`}>
              Abrir {node.kind === 'stage' ? 'la etapa' : node.kind === 'test' ? 'el test' : 'el challenge'} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
          {node.kind === 'challenge' && challenge && <p className={styles.muted}>{DIFFICULTY_LABEL[challenge.difficulty]} · {challenge.stages.length} etapas</p>}
        </div>
      </Card>
    </StickyPanel>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}
