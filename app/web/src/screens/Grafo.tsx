import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search } from 'lucide-react';
import { DOMAINS, DOMAIN_BY_ID } from '../../../shared/domains';
import type { ConceptState, DomainId } from '../../../shared/types';
import { PageHeader, Skeleton } from '../components/cards';
import { DomainTile } from '../components/DomainTile';
import { FilterChip } from '../components/FilterChip';
import { layoutGraph } from '../domain/graphLayout';
import { searchConcepts } from '../domain/graphQueries';
import { useApp } from '../data/DataContext';
import { GraphCanvas } from './graph/GraphCanvas';
import { GraphPanel } from './graph/GraphPanel';
import styles from './Grafo.module.css';

export function Grafo() {
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
      <PageHeader title="Grafo de conocimiento" subtitle={subtitle} />

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
