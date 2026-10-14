import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useElementWidth } from '../../charts/useElementWidth';
import { centerOn, fitView, zoomAt, type View } from '../../domain/graphView';

export interface PanZoomFocus {
  x: number;
  y: number;
  /** Cambia para volver a centrar en el mismo punto. */
  nonce: number;
}

/**
 * Pan y zoom de un lienzo SVG (0.5×–2.5×): arrastrar mueve, la rueda hace zoom sobre el cursor y `focus` centra un
 * punto. Mantiene la vista en una transformación del grupo raíz, así que no vuelve a pintar los nodos al moverse.
 */
export function usePanZoom(content: { width: number; height: number }, height: number, focus: PanZoomFocus | null) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const width = useElementWidth(wrapRef, 880);
  const canvas = useMemo(() => ({ width, height }), [width, height]);
  const [view, setView] = useState<View>(() => fitView(content, { width: 880, height }));
  const fitted = useRef(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; id: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Ajuste inicial cuando se conoce el ancho real, y de nuevo si cambia el tamaño del contenido.
  useEffect(() => {
    fitted.current = false;
  }, [content.width, content.height]);
  useEffect(() => {
    if (!fitted.current && width > 0) {
      setView(fitView(content, canvas));
      fitted.current = true;
    }
  }, [content, canvas, width]);

  useEffect(() => {
    if (focus) setView((v) => centerOn(v, focus.x, focus.y, canvas));
  }, [focus, canvas]);

  // La rueda debe registrarse como no pasiva para poder evitar el scroll de la página.
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
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, id: e.pointerId, moved: false };
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
  const fit = useCallback(() => setView(fitView(content, canvas)), [content, canvas]);

  return {
    wrapRef,
    svgRef,
    width,
    view,
    dragging,
    zoomBy,
    fit,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
  };
}
