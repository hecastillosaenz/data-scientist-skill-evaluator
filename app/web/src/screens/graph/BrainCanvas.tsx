import { memo, useMemo, type KeyboardEvent } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { CONCEPT_STATE_LABEL, DOMAIN_BY_ID, STAGE_STATUS_LABEL } from '../../../../shared/domains';
import type { ChallengeStatus, DomainId } from '../../../../shared/types';
import { KIND_LABEL_SINGULAR, brainOpacity, type BrainEdge, type BrainGraph, type BrainKind, type BrainNode } from '../../domain/brainGraph';
import { usePanZoom } from './usePanZoom';
import styles from './BrainCanvas.module.css';

export const BRAIN_HEIGHT = 640;
const LABELS_FROM_ZOOM = 1.3;
const CHALLENGE_STATUS_LABEL: Record<ChallengeStatus, string> = { en_curso: 'En curso', pendiente: 'Pendiente', completada: 'Completada' };

interface Props {
  graph: BrainGraph;
  kinds: ReadonlySet<BrainKind>;
  domains: ReadonlySet<DomainId>;
  selectedId: string | null;
  /** Nodos a rotular siempre (vecinos del seleccionado y resultados de búsqueda). */
  emphasizedIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  focus: { id: string; nonce: number } | null;
}

/** Solo se escribe `opacity` cuando un filtro atenúa el elemento: evita crear capas de composición para cientos de nodos. */
const dim = (o: number) => (o === 1 ? undefined : { opacity: o });

const STATE_CLASS = { no_visto: styles.sNo, visto: styles.sSeen, dominado: styles.sMastered, con_fallos: styles.sFail } as const;

function ariaLabel(n: BrainNode): string {
  const extra =
    n.kind === 'concept'
      ? `${n.domain ? DOMAIN_BY_ID[n.domain].name + ', ' : ''}${CONCEPT_STATE_LABEL[n.conceptState ?? 'no_visto']}`
      : n.kind === 'challenge'
        ? CHALLENGE_STATUS_LABEL[(n.status as ChallengeStatus) ?? 'pendiente']
        : n.kind === 'stage'
          ? STAGE_STATUS_LABEL[(n.status as keyof typeof STAGE_STATUS_LABEL) ?? 'pendiente']
          : n.kind === 'test'
            ? n.score ? `resultado ${n.score}` : 'pendiente'
            : `prioridad ${n.priority ?? ''}`;
  return `${KIND_LABEL_SINGULAR[n.kind]}: ${n.label}, ${extra}`;
}

/** Forma del nodo según su tipo: concepto (círculo), challenge (cuadrado), etapa (rombo), test (triángulo), mejora (insignia). */
function Shape({ node }: { node: BrainNode }) {
  switch (node.kind) {
    case 'concept': {
      const r = node.conceptState === 'dominado' ? 6.5 : node.conceptState === 'no_visto' ? 4.5 : 5.5;
      return <circle r={r} className={`${styles.dot} ${STATE_CLASS[node.conceptState ?? 'no_visto']}`} />;
    }
    case 'challenge':
      return <rect x={-9} y={-9} width={18} height={18} rx={4} className={styles.challenge} />;
    case 'stage':
      return <rect x={-5.5} y={-5.5} width={11} height={11} rx={2} transform="rotate(45)" className={styles.stage} />;
    case 'test':
      return <path d="M0,-8 L8,6 L-8,6 Z" className={styles.test} strokeLinejoin="round" />;
    case 'mejora':
      return <circle r={3.6} className={styles.mejora} />;
  }
}

const EDGE_CLASS: Record<BrainEdge['kind'], string> = {
  prerequisito: styles.ePrereq!,
  contiene: styles.eContains!,
  practica: styles.ePractice!,
  evalua: styles.eTest!,
  cierra: styles.eClose!,
  mejora: styles.eFix!,
};

/** Capa estática: no se vuelve a pintar durante el pan y el zoom (solo cambia la transformación del grupo padre). */
const BrainLayer = memo(function BrainLayer({
  graph,
  kinds,
  domains,
  selectedId,
  emphasizedIds,
  labelsOn,
  onSelect,
}: Omit<Props, 'focus'> & { labelsOn: boolean }) {
  const opacity = useMemo(() => new Map(graph.nodes.map((n) => [n.id, brainOpacity(n, graph, kinds, domains)])), [graph, kinds, domains]);
  const incident = useMemo(() => new Set(graph.edges.filter((e) => e.from === selectedId || e.to === selectedId).map((e) => e.id)), [graph, selectedId]);
  const edgePath = (e: BrainEdge) => {
    const a = graph.byId.get(e.from)!;
    const b = graph.byId.get(e.to)!;
    return `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  };
  const onKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };
  // Primero los conceptos y al final los challenges, para que lo importante quede encima.
  const order: BrainKind[] = ['concept', 'mejora', 'stage', 'test', 'challenge'];
  const sorted = useMemo(() => [...graph.nodes].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)), [graph]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <g aria-hidden="true">
        {graph.domainCenters.map((c) => (
          <text key={c.domain} x={c.x} y={c.y} className={`${styles.territory} ${domains.size === 0 || domains.has(c.domain) ? '' : styles.territoryDim}`} textAnchor="middle">
            {DOMAIN_BY_ID[c.domain].name}
          </text>
        ))}
      </g>
      <g>
        {graph.edges.filter((e) => !incident.has(e.id)).map((e) => (
          <path key={e.id} d={edgePath(e)} className={EDGE_CLASS[e.kind]} style={dim(Math.min(opacity.get(e.from)!, opacity.get(e.to)!))} />
        ))}
      </g>
      <g className={styles.eActive}>
        {graph.edges.filter((e) => incident.has(e.id)).map((e) => <path key={e.id} d={edgePath(e)} />)}
      </g>
      <g>
        {sorted.map((n) => {
          const selected = n.id === selectedId;
          const always = n.kind === 'challenge' && labelsOn;
          const showLabel = (labelsOn && n.kind !== 'mejora') || always || selected || emphasizedIds.has(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`}
              className={`${styles.node} ${selected ? styles.selected : ''}`}
              style={dim(opacity.get(n.id)!)}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={ariaLabel(n)}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => onKey(e, n.id)}
            >
              <circle r={14} className={styles.hit} />
              {selected && <circle r={n.kind === 'challenge' ? 18 : 12} className={styles.halo} />}
              <Shape node={n} />
              {showLabel && (
                <text x={n.kind === 'challenge' ? 14 : 9} y={4} className={`${styles.label} ${n.kind === 'challenge' ? styles.labelStrong : ''}`}>
                  {n.kind === 'test' ? 'Test' : n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </>
  );
});

export function BrainCanvas({ graph, kinds, domains, selectedId, emphasizedIds, onSelect, focus }: Props) {
  const focusPoint = useMemo(() => {
    const node = focus ? graph.byId.get(focus.id) : null;
    return focus && node ? { x: node.x, y: node.y, nonce: focus.nonce } : null;
  }, [focus, graph]);
  const { wrapRef, svgRef, width, view, dragging, zoomBy, fit, handlers } = usePanZoom(graph, BRAIN_HEIGHT, focusPoint);
  const labelsOn = view.k >= LABELS_FROM_ZOOM;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <svg
        ref={svgRef}
        width={width}
        height={BRAIN_HEIGHT}
        className={`${styles.svg} ${dragging ? styles.grabbing : ''}`}
        role="group"
        aria-label="Grafo unificado: conceptos, challenges, etapas, tests y mejoras. Arrastra para mover, usa la rueda o los botones para hacer zoom."
        {...handlers}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <BrainLayer graph={graph} kinds={kinds} domains={domains} selectedId={selectedId} emphasizedIds={emphasizedIds} labelsOn={labelsOn} onSelect={onSelect} />
        </g>
      </svg>

      <div className={styles.controls} role="group" aria-label="Controles de zoom">
        <button type="button" aria-label="Acercar" onClick={() => zoomBy(1.3)}><Plus size={18} strokeWidth={1.5} aria-hidden="true" /></button>
        <button type="button" aria-label="Alejar" onClick={() => zoomBy(1 / 1.3)}><Minus size={18} strokeWidth={1.5} aria-hidden="true" /></button>
        <button type="button" aria-label="Ajustar a la vista" onClick={fit}><Maximize2 size={16} strokeWidth={1.5} aria-hidden="true" /></button>
      </div>

      <ul className={styles.legend} aria-label="Leyenda">
        <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className={`${styles.dot} ${styles.sMastered}`} /></svg> Concepto</li>
        <li><svg width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="3" className={styles.challenge} /></svg> Challenge</li>
        <li><svg width="14" height="14" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" transform="rotate(45 7 7)" className={styles.stage} /></svg> Etapa</li>
        <li><svg width="14" height="14" aria-hidden="true"><path d="M7,2 L12,11 L2,11 Z" className={styles.test} strokeLinejoin="round" /></svg> Test</li>
        <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="3.6" className={styles.mejora} /></svg> Mejora</li>
      </ul>
      <p className={`${styles.zoomHint} mono`}>{Math.round(view.k * 100)}%</p>
    </div>
  );
}
