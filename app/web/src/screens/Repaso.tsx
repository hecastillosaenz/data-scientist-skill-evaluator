import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { CONCEPT_STATE_LABEL } from '../../../shared/domains';
import type { ConceptState } from '../../../shared/types';
import { Card, EmptyState, PageHeader, Skeleton, StickyPanel } from '../components/cards';
import { DifficultyChip, StatusChip, TimeChip } from '../components/chips';
import { DomainTile } from '../components/DomainTile';
import { FilterChip } from '../components/FilterChip';
import { Segmented } from '../components/Segmented';
import { buildReinforcement, type Reinforcement } from '../domain/reinforcement';
import { buildReviewQueue, PRIORITY_LABEL, REASON_LABEL, type ReviewItem, type ReviewReason } from '../domain/reviewQueue';
import { formatShortDate, relativeTime } from '../charts/format';
import { useApp } from '../data/DataContext';
import styles from './Repaso.module.css';

type View = 'prioridad' | 'motivo';
const REASONS: ReviewReason[] = ['fallos', 'parcial', 'ayuda', 'olvido'];
const LEGEND: ConceptState[] = ['no_visto', 'visto', 'dominado', 'con_fallos'];

export function Repaso() {
  const { loading, data, now, insights } = useApp();
  const [view, setView] = useState<View>('prioridad');
  const [reason, setReason] = useState<ReviewReason | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queue = useMemo(() => (data ? buildReviewQueue(data.concepts, data.challenges, data.evidence, now) : []), [data, now]);
  if (loading || !data) return <div aria-busy="true"><Skeleton w={200} h={32} /><div style={{ height: 24 }} /><Skeleton h={400} r={16} /></div>;

  const visible = reason ? queue.filter((i) => i.reason === reason) : queue;
  const selected = visible.find((i) => i.concept.id === selectedId) ?? visible[0] ?? null;
  const count = (r: ReviewReason) => queue.filter((i) => i.reason === r).length;

  return (
    <>
      <PageHeader
        title="Repaso"
        subtitle={queue.length > 0 ? `${queue.length} conceptos para repasar, ordenados según tu grafo` : undefined}
        actions={
          queue.length > 0 && (
            <Segmented
              label="Ordenar"
              options={[{ value: 'prioridad', label: 'Por prioridad' }, { value: 'motivo', label: 'Por motivo' }]}
              value={view}
              onChange={setView}
            />
          )
        }
      />

      {queue.length === 0 ? (
        <EmptyState
          title="Todavía no hay conceptos para repasar"
          text="Cuando completes etapas, aquí verás qué conceptos conviene reforzar primero."
          action={<Link to="/challenges" className="btn btn-primary">Ver challenges</Link>}
        />
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.chips} role="group" aria-label="Filtrar por motivo">
              <FilterChip active={reason === null} count={queue.length} onClick={() => setReason(null)}>Todos</FilterChip>
              {REASONS.map((r) => (
                <FilterChip key={r} active={reason === r} count={count(r)} onClick={() => setReason(reason === r ? null : r)}>
                  {REASON_LABEL[r]}
                </FilterChip>
              ))}
            </div>
            <ul className={styles.legend} aria-label="Leyenda del estado del grafo">
              {LEGEND.map((s) => <li key={s}><StatusChip state={s} kind="concept" /></li>)}
            </ul>
          </div>

          <div className={styles.layout}>
            <div className={styles.queue}>
              {view === 'prioridad' ? (
                <Queue items={visible} selectedId={selected?.concept.id ?? null} onSelect={setSelectedId} insights={insights} now={now} />
              ) : (
                REASONS.filter((r) => visible.some((i) => i.reason === r)).map((r) => (
                  <section key={r} aria-label={REASON_LABEL[r]}>
                    <h3 className={styles.groupTitle}>{REASON_LABEL[r]} · <span className="mono">{visible.filter((i) => i.reason === r).length}</span></h3>
                    <Queue items={visible.filter((i) => i.reason === r)} selectedId={selected?.concept.id ?? null} onSelect={setSelectedId} insights={insights} now={now} />
                  </section>
                ))
              )}
            </div>

            {selected && <SidePanel key={selected.concept.id} item={selected} stateOf={(id) => insights.get(id)?.state ?? 'no_visto'} />}
          </div>
        </>
      )}
    </>
  );
}

function Queue({ items, selectedId: sel, onSelect, insights, now }: { items: ReviewItem[]; selectedId: string | null; onSelect: (id: string) => void; insights: Map<string, { state: ConceptState }>; now: Date }) {
  return (
    <Card className={styles.listCard}>
      <ul className={styles.list}>
        {items.map((item) => {
          const state = insights.get(item.concept.id)?.state ?? 'no_visto';
          const last = new Date(item.lastPracticed);
          return (
            <li key={item.concept.id} className={`${styles.row} ${item.concept.id === sel ? styles.selected : ''}`}>
              <button type="button" className={styles.rowMain} aria-pressed={item.concept.id === sel} onClick={() => onSelect(item.concept.id)}>
                <DomainTile domain={item.concept.domain} />
                <span className={styles.topic}>
                  <strong>{item.concept.name}</strong>
                  <span>Etapa {item.source.stage.number} · {item.source.stage.title} — {item.source.challenge.title}</span>
                  <em>{REASON_LABEL[item.reason]}</em>
                </span>
              </button>
              <div className={styles.rowMeta}>
                <StatusChip state={state} kind="concept" />
                <span className={`${styles.last} mono`} title={formatShortDate(last)}>{relativeTime(last, now)}</span>
                <span className={`${styles.priority} ${styles[item.priority]}`} title={`Prioridad ${PRIORITY_LABEL[item.priority].toLowerCase()}`}>
                  <i /><i /><i />
                  <span>{PRIORITY_LABEL[item.priority]}</span>
                </span>
                <Link className="btn btn-sm" to={`/challenge-actual/${item.source.challenge.id}`}>Practicar</Link>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SidePanel({ item, stateOf }: { item: ReviewItem; stateOf: (id: string) => ConceptState }) {
  const { data } = useApp();
  const [generating, setGenerating] = useState(false);
  const [reinforcement, setReinforcement] = useState<Reinforcement | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const concepts = (reinforcement?.conceptIds ?? item.source.stage.conceptIds).map((id) => data?.concepts.find((c) => c.id === id)).filter((c) => !!c);

  const generate = () => {
    setGenerating(true);
    window.setTimeout(() => {
      setReinforcement(buildReinforcement(item));
      setGenerating(false);
    }, 900);
  };

  return (
    <StickyPanel label="Reto de refuerzo">
      <Card className={styles.panel}>
        <div>
          <h2>Reto de refuerzo</h2>
          <p className={styles.panelSub}>Para «{item.concept.name}»</p>
        </div>
        {reinforcement ? (
          <div className={styles.reinforcement} aria-live="polite">
            <strong>{reinforcement.title}</strong>
            <div className={styles.rMeta}>
              <DifficultyChip difficulty={reinforcement.difficulty} />
              <TimeChip minutes={reinforcement.minutes} />
            </div>
            <ul className={styles.rFacts}>
              <li>Dificultad: un nivel menos que la etapa original</li>
              <li>Tiempo: 5 min menos que lo estimado</li>
              <li>Apoyo sugerido: <strong>Pistas</strong></li>
            </ul>
            <p className={styles.panelSub}>Generado de ejemplo: el Generador real llega con P3.</p>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" onClick={generate} disabled={generating}>
            <Sparkles size={16} aria-hidden="true" /> {generating ? 'Generando…' : 'Generar reto de refuerzo'}
          </button>
        )}

        <div>
          <h3>Conceptos por investigar</h3>
          <p className={`${styles.progress} mono`}>{checked.size} de {concepts.length} revisados</p>
          <ul className={styles.checklist}>
            {concepts.map((c) => c && (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked.has(c.id)}
                    onChange={() => setChecked((prev) => { const next = new Set(prev); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next; })}
                  />
                  <span>{c.name}</span>
                </label>
                <span className={styles.state}>{CONCEPT_STATE_LABEL[stateOf(c.id)]}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </StickyPanel>
  );
}
