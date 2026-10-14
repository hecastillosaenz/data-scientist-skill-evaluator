export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;

export interface View {
  /** Escala. */
  k: number;
  /** Desplazamiento en px de pantalla. */
  x: number;
  y: number;
}

export const clampZoom = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** Ajusta el contenido al lienzo respetando los límites de zoom (0.5×–2.5×) y lo centra. */
export function fitView(content: { width: number; height: number }, canvas: { width: number; height: number }): View {
  const k = clampZoom(Math.min(canvas.width / content.width, canvas.height / content.height));
  return {
    k,
    x: (canvas.width - content.width * k) / 2,
    y: (canvas.height - content.height * k) / 2,
  };
}

/** Zoom multiplicativo manteniendo fijo el punto (px, py) del lienzo. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

/** Vista que deja el punto de contenido (cx, cy) en el centro del lienzo con al menos `minK` de zoom. */
export function centerOn(view: View, cx: number, cy: number, canvas: { width: number; height: number }, minK = 1): View {
  const k = clampZoom(Math.max(view.k, minK));
  return { k, x: canvas.width / 2 - cx * k, y: canvas.height / 2 - cy * k };
}
