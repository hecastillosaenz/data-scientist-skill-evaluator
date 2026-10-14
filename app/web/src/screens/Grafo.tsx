import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { DOMAINS, DOMAIN_BY_ID } from '../../../shared/domains';
import type { ConceptState, DomainId } from '../../../shared/types';
import { PageHeader, Skeleton } from '../components/cards';
import { DomainTile } from '../components/DomainTile';
import { FilterChip } from '../components/FilterChip';
import { Segmented } from '../components/Segmented';
import { BRAIN_KINDS, KIND_LABEL, buildBrainGraph, type BrainKind } from '../domain/brainGraph';
import { searchBrain } from '../domain/brainGraph';
import { latestResults, scoreOf } from '../domain/finalTest';
import { buildReviewQueue } from '../domain/reviewQueue';
import { layoutGraph } from '../domain/graphLayout';
import { searchConcepts } from '../domain/graphQueries';
import { useApp } from '../data/DataContext';
import { BrainCanvas } from './graph/BrainCanvas';
import { BrainPanel } from './graph/BrainPanel';
import { GraphCanvas } from './graph/GraphCanvas';
import { GraphPanel } from './graph/GraphPanel';
import styles from './Grafo.module.css';

/** Vista de conceptos (R15): los 6 dominios a la vez; los chips atenúan, no ocultan. */
function ConceptsView({ viewSwitch }: { viewSwitch: ReactNode }) {
  const { loading, data, insights } = useApp();
  const [params, setParams] = useSearchParams();
  const [active, setActive] = useState<Set<DomainId>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(params.get('concepto'));
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(() => {
    const id = params.get('concepto');
    return id ? { id, nonce: 0 } : null;
  });
  const [query, setQuery] = useState('');

  const layout = useMemo(() => (data ? layoutGraph(data.concepts) : null), [data]);
  const concepts = data?.concepts ?? [];
  const results = useMemo(() => searchConcepts(query, concepts), [query, concepts]);

  // Navegar con ?concepto=ID (p. ej. desde un chip de la etapa) selecciona y centra el nodo.
  const conceptParam = params.get('concepto');
  useEffect(() => {
    if (conceptParam) {
      setSelectedId(conceptParam);
      setFocus((f) => ({ id: conceptParam, nonce: (f?.nonce ?? 0) + 1 }));
    }
  }, [conceptParam]);

  if (loading || !data || !layout) return <div aria-busy="true"><Skeleton w={320} h={32} /><div style={{ height: 20 }} /><Skeleton h={540} r={16} /></div>;

  const select = (id: string, center = false) => {
    setSelectedId(id);
    if (center) setFocus((f) => ({ id, nonce: (f?.nonce ?? 0) + 1 }));
  };
  const selected = data.concepts.find((c) => c.id === selectedId) ?? null;
  const stateOf = (id: string): ConceptState => insights.get(id)?.state ?? 'no_visto';

  const countByDomain = (d: DomainId) => data.concepts.filter((c) => c.domain === d).length;
  const subtitle =
    active.size === 0
      ? `${data.concepts.length} conceptos en 6 dominios`
      : `${data.concepts.filter((c) => active.has(c.domain)).length} conceptos en ${[...active].map((d) => DOMAIN_BY_ID[d].short).join(', ')}`;

  const emphasized = new Set<string>();
  if (selected) {
    selected.prerequisites.forEach((p) => emphasized.add(p));
    data.concepts.filter((c) => c.prerequisites.includes(selected.id)).forEach((c) => emphasized.add(c.id));
  }
  for (const r of results) emphasized.add(r.id);

  return (
    <>
      <PageHeader title="Grafo de conocimiento" subtitle={subtitle} actions={viewSwitch} />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={16} strokeWidth={1.5} aria-hidden="true" />
          <input
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="graph-results"
            aria-label="Buscar concepto"
            placeholder="Buscar concepto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) {
                select(results[0].id, true);
                setQuery('');
              }
              if (e.key === 'Escape') setQuery('');
            }}
          />
          {results.length > 0 && (
            <ul id="graph-results" role="listbox" className={styles.results}>
              {results.map((c) => (
                <li key={c.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => {
                      select(c.id, true);
                      setQuery('');
                    }}
                  >
                    <DomainTile domain={c.domain} size={22} />
                    <span>{c.name}</span>
                    <span className={styles.resultDomain}>{DOMAIN_BY_ID[c.domain].short}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.chips} role="group" aria-label="Atenuar por dominio">
          {DOMAINS.map((d) => (
            <FilterChip
              key={d.id}
              count={countByDomain(d.id)}
              active={active.has(d.id)}
              onClick={() =>
                setActive((prev) => {
                  const next = new Set(prev);
                  if (next.has(d.id)) next.delete(d.id);
                  else next.add(d.id);
                  return next;
                })
              }
            >
              {d.short}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className={styles.layout}>
        <GraphCanvas
          layout={layout}
          stateOf={stateOf}
          activeDomains={active}
          selectedId={selectedId}
          emphasizedIds={emphasized}
          onSelect={(id) => {
            setSelectedId(id);
            if (conceptParam) setParams({}, { replace: true });
          }}
          focus={focus}
        />
        <GraphPanel
          concepts={data.concepts}
          challenges={data.challenges}
          evidence={data.evidence}
          insights={insights}
          selected={selected}
          onSelect={(id) => select(id, true)}
        />
      </div>
    </>
  );
}

type View = 'conceptos' | 'brain';

/** Vista unificada (R32, «second brain»): conceptos, challenges, etapas, tests y mejoras en un solo mapa. */
function BrainView({ viewSwitch }: { viewSwitch: ReactNode }) {
  const { loading, data, now, insights, challengeStatusOf, stageStatusesOf } = useApp();
  const [kinds, setKinds] = useState<Set<BrainKind>>(new Set());
  const [domains, setDomains] = useState<Set<DomainId>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const [query, setQuery] = useState('');

  const graph = useMemo(() => {
    if (!data) return null;
    return buildBrainGraph({
      data,
      insights,
      queue: buildReviewQueue(data.concepts, data.challenges, data.evidence, now, data.testResults),
      challengeStatus: challengeStatusOf,
      stageStatuses: stageStatusesOf,
      testScore: (c) => {
        const score = scoreOf(latestResults(data.testResults, c.id), c.finalTest ?? []);
        return score ? `${score.correct}/${score.total}` : null;
      },
    });
  }, [data, insights, now, challengeStatusOf, stageStatusesOf]);
  const results = useMemo(() => (graph ? searchBrain(graph, query) : []), [graph, query]);

  if (loading || !data || !graph) return <div aria-busy="true"><Skeleton w={320} h={32} /><div style={{ height: 20 }} /><Skeleton h={640} r={16} /></div>;

  const select = (id: string, center = false) => {
    setSelectedId(id);
    if (center) setFocus((f) => ({ id, nonce: (f?.nonce ?? 0) + 1 }));
  };
  const selected = selectedId ? (graph.byId.get(selectedId) ?? null) : null;
  const emphasized = new Set<string>(results.map((r) => r.id));
  if (selected) for (const e of graph.edges) if (e.from === selected.id || e.to === selected.id) emphasized.add(e.from === selected.id ? e.to : e.from);
  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const countKind = (k: BrainKind) => graph.nodes.filter((n) => n.kind === k).length;

  return (
    <>
      <PageHeader title="Grafo de conocimiento" subtitle={`${graph.nodes.length} nodos y ${graph.edges.length} relaciones: tu second brain`} actions={viewSwitch} />

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Search size={16} strokeWidth={1.5} aria-hidden="true" />
          <input
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="brain-results"
            aria-label="Buscar en el second brain"
            placeholder="Buscar concepto, challenge o etapa…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) {
                select(results[0].id, true);
                setQuery('');
              }
              if (e.key === 'Escape') setQuery('');
            }}
          />
          {results.length > 0 && (
            <ul id="brain-results" role="listbox" className={styles.results}>
              {results.map((n) => (
                <li key={n.id} role="option" aria-selected={false}>
                  <button type="button" onClick={() => { select(n.id, true); setQuery(''); }}>
                    {n.domain ? <DomainTile domain={n.domain} size={22} /> : <span aria-hidden="true" />}
                    <span>{n.label}</span>
                    <span className={styles.resultDomain}>{KIND_LABEL[n.kind]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.chipGroups}>
          <div className={styles.chips} role="group" aria-label="Atenuar por tipo">
            {BRAIN_KINDS.map((k) => (
              <FilterChip key={k} count={countKind(k)} active={kinds.has(k)} onClick={() => setKinds((prev) => toggle(prev, k))}>
                {KIND_LABEL[k]}
              </FilterChip>
            ))}
          </div>
          <div className={styles.chips} role="group" aria-label="Atenuar por dominio">
            {DOMAINS.map((d) => (
              <FilterChip key={d.id} active={domains.has(d.id)} onClick={() => setDomains((prev) => toggle(prev, d.id))}>
                {d.short}
              </FilterChip>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.layout}>
        <BrainCanvas graph={graph} kinds={kinds} domains={domains} selectedId={selectedId} emphasizedIds={emphasized} onSelect={(id) => select(id)} focus={focus} />
        <BrainPanel graph={graph} node={selected} challenges={data.challenges} onSelect={(id) => select(id, true)} />
      </div>
    </>
  );
}

/** Pantalla de Grafo con dos vistas: conceptos y second brain (la vista se guarda en la URL: `?vista=brain`). */
export function Grafo() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vista') === 'brain' ? 'brain' : 'conceptos';
  const switchView = (next: View) => {
    const copy = new URLSearchParams(params);
    if (next === 'brain') copy.set('vista', 'brain');
    else copy.delete('vista');
    copy.delete('concepto');
    setParams(copy, { replace: true });
  };
  const viewSwitch = (
    <Segmented<View>
      label="Vista"
      options={[{ value: 'conceptos', label: 'Conceptos' }, { value: 'brain', label: 'Second brain' }]}
      value={view}
      onChange={switchView}
    />
  );
  return view === 'brain' ? <BrainView viewSwitch={viewSwitch} /> : <ConceptsView viewSwitch={viewSwitch} />;
}
