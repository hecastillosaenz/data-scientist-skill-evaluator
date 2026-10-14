import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { CONCEPT_STATE_LABEL, DOMAIN_BY_ID } from '../../../../shared/domains';
import type { ConceptState, DomainId } from '../../../../shared/types';
import { useElementWidth } from '../../charts/useElementWidth';
import { domainOpacity } from '../../domain/graphQueries';
import type { GraphLayout, LayoutEdge, LayoutNode } from '../../domain/graphLayout';
import { centerOn, fitView, zoomAt, type View } from '../../domain/graphView';
import styles from './GraphCanvas.module.css';

export const CANVAS_HEIGHT = 540;
const LABELS_FROM_ZOOM = 1.15;
const STATE_CLASS: Record<ConceptState, string> = {
  no_visto: styles.sNo!,
  visto: styles.sSeen!,
  dominado: styles.sMastered!,
  con_fallos: styles.sFail!,
};
const RADIUS: Record<ConceptState, number> = { no_visto: 4.5, visto: 5.5, dominado: 6.5, con_fallos: 5.5 };

interface Props {
  layout: GraphLayout;
  stateOf: (id: string) => ConceptState;
  activeDomains: ReadonlySet<DomainId>;
  selectedId: string | null;
  /** Conceptos a destacar con etiqueta (vecinos del seleccionado). */
  emphasizedIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  /** Pide centrar el lienzo en un nodo; `nonce` fuerza repetir el mismo id. */
  focus: { id: string; nonce: number } | null;
}

/** Capa estática del grafo: no se vuelve a renderizar durante pan/zoom (solo cambia la transformación del grupo padre). */
const GraphLayer = memo(function GraphLayer({
  layout,
  stateOf,
  activeDomains,
  selectedId,
  emphasizedIds,
  labelsOn,
  onSelect,
}: Omit<Props, 'focus'> & { labelsOn: boolean }) {
  const incident = useMemo(
    () => (selectedId ? layout.edges.filter((e) => e.from === selectedId || e.to === selectedId) : []),
    [layout, selectedId],
  );
  const incidentIds = useMemo(() => new Set(incident.map((e) => e.id)), [incident]);
  const edgeOpacity = (e: LayoutEdge) =>
    Math.min(
      domainOpacity(layout.byId.get(e.from)!.concept.domain, activeDomains),
      domainOpacity(layout.byId.get(e.to)!.concept.domain, activeDomains),
    );
  const path = (e: LayoutEdge) => {
    const a = layout.byId.get(e.from)!;
    const b = layout.byId.get(e.to)!;
    const dx = (b.x - a.x) / 2;
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  };

  const onKey = (event: KeyboardEvent, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <>
      {layout.lanes.map((lane, i) => (
        <rect
          key={lane.domain}
          x={0}
          y={lane.y}
          width={layout.width}
          height={lane.height}
          className={i % 2 === 0 ? styles.laneA : styles.laneB}
          style={{ opacity: domainOpacity(lane.domain, activeDomains) }}
        />
      ))}
      <g className={styles.edges}>
        {layout.edges
          .filter((e) => !incidentIds.has(e.id))
          .map((e) => (
            <path key={e.id} d={path(e)} style={{ opacity: edgeOpacity(e) }} />
          ))}
      </g>
      <g className={styles.edgesActive}>
        {incident.map((e) => (
          <path key={e.id} d={path(e)} />
        ))}
      </g>
      <g>
        {layout.nodes.map((n: LayoutNode) => {
          const state = stateOf(n.id);
          const selected = n.id === selectedId;
          const showLabel = labelsOn || selected || emphasizedIds.has(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              className={`${styles.node} ${selected ? styles.selected : ''}`}
              style={{ opacity: domainOpacity(n.concept.domain, activeDomains) }}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={`${n.concept.name}, ${DOMAIN_BY_ID[n.concept.domain].name}, ${CONCEPT_STATE_LABEL[state]}`}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => onKey(e, n.id)}
            >
              <circle r={14} className={styles.hit} />
              {selected && <circle r={RADIUS[state] + 4} className={styles.ring} />}
              <circle r={RADIUS[state]} className={`${styles.dot} ${STATE_CLASS[state]}`} />
              {showLabel && (
                <text x={RADIUS[state] + 6} y={4} className={styles.label}>
                  {n.concept.name}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </>
  );
});

export function GraphCanvas({ layout, stateOf, activeDomains, selectedId, emphasizedIds, onSelect, focus }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useElementWidth(wrapRef, 880);
  const canvas = useMemo(() => ({ width, height: CANVAS_HEIGHT }), [width]);
  const [view, setView] = useState<View>(() => fitView(layout, { width: 880, height: CANVAS_HEIGHT }));
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Ajuste inicial cuando se conoce el ancho real del lienzo.
  useEffect(() => {
    if (!fitted.current && width > 0) {
      setView(fitView(layout, canvas));
      fitted.current = true;
    }
  }, [layout, canvas, width]);

  useEffect(() => {
    if (!focus) return;
    const node = layout.byId.get(focus.id);
    if (node) setView((v) => centerOn(v, node.x, node.y, canvas));
  }, [focus, layout, canvas]);

  // La rueda hace zoom; el listener debe ser no pasivo para poder evitar el scroll de la página.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      // Solo se captura el puntero cuando hay arrastre real, para que un clic simple llegue al nodo.
      d.moved = true;
      svgRef.current?.setPointerCapture(d.id);
      setDragging(true);
    }
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const zoomBy = useCallback((factor: number) => setView((v) => zoomAt(v, factor, canvas.width / 2, canvas.height / 2)), [canvas]);
  const labelsOn = view.k >= LABELS_FROM_ZOOM;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <svg
        ref={svgRef}
        width={width}
        height={CANVAS_HEIGHT}
        className={`${styles.svg} ${dragging ? styles.grabbing : ''}`}
        role="group"
        aria-label="Grafo de conocimiento. Arrastra para mover, usa la rueda o los botones para hacer zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <GraphLayer
            layout={layout}
            stateOf={stateOf}
            activeDomains={activeDomains}
            selectedId={selectedId}
            emphasizedIds={emphasizedIds}
            labelsOn={labelsOn}
            onSelect={onSelect}
          />
          {/* Rótulos de carril fijos al borde izquierdo de la vista (tamaño constante en pantalla). */}
          {layout.lanes.map((lane) => (
            <text
              key={lane.domain}
              x={-view.x / view.k + 10 / view.k}
              y={lane.y + lane.height / 2}
              className={styles.laneLabel}
              style={{ fontSize: 12 / view.k, opacity: domainOpacity(lane.domain, activeDomains) }}
              dominantBaseline="middle"
            >
              {DOMAIN_BY_ID[lane.domain].short}
            </text>
          ))}
        </g>
      </svg>

      <div className={styles.controls} role="group" aria-label="Controles de zoom">
        <button type="button" aria-label="Acercar" onClick={() => zoomBy(1.3)}><Plus size={18} strokeWidth={1.5} aria-hidden="true" /></button>
        <button type="button" aria-label="Alejar" onClick={() => zoomBy(1 / 1.3)}><Minus size={18} strokeWidth={1.5} aria-hidden="true" /></button>
        <button type="button" aria-label="Ajustar a la vista" onClick={() => setView(fitView(layout, canvas))}><Maximize2 size={16} strokeWidth={1.5} aria-hidden="true" /></button>
      </div>

      <ul className={styles.legend} aria-label="Leyenda">
        {(['no_visto', 'visto', 'dominado', 'con_fallos'] as ConceptState[]).map((s) => (
          <li key={s}>
            <svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className={`${styles.dot} ${STATE_CLASS[s]}`} /></svg>
            {CONCEPT_STATE_LABEL[s]}
          </li>
        ))}
      </ul>
      <p className={`${styles.zoomHint} mono`}>{Math.round(view.k * 100)}%</p>
    </div>
  );
}
