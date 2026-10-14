/**
 * Localiza en un notebook la celda entregable de una etapa (R8) y las celdas de datos (R27).
 * Marcador de entregable: primera línea `# Entregable - Etapa X:` (celda de código o markdown).
 * Marcador de datos: primera línea `# Datos`.
 */
export type NotebookErrorCode = 'notebook_invalido' | 'celda_no_encontrada' | 'etapa_no_coincide' | 'marcador_duplicado';

export class NotebookError extends Error {
  constructor(message: string, readonly code: NotebookErrorCode) {
    super(message);
    this.name = 'NotebookError';
  }
}

export interface NotebookCell {
  kind: 'code' | 'markdown';
  source: string;
}

export function parseNotebook(raw: string): NotebookCell[] {
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new NotebookError('El notebook no es un JSON válido (.ipynb).', 'notebook_invalido');
  }
  if (!Array.isArray(json?.cells)) throw new NotebookError('El notebook no tiene celdas (.ipynb inválido).', 'notebook_invalido');
  return json.cells
    .filter((c: any) => c?.cell_type === 'code' || c?.cell_type === 'markdown')
    .map((c: any) => ({ kind: c.cell_type, source: Array.isArray(c.source) ? c.source.join('') : String(c.source ?? '') }));
}

const MARKER = /^#\s*Entregable\s*-\s*Etapa\s+(\d+)\s*:/i;
const firstLine = (cell: NotebookCell) => cell.source.split(/\r?\n/, 1)[0]?.trim() ?? '';

export interface Deliverable {
  kind: 'code' | 'markdown';
  /** Contenido completo de la celda, marcador incluido. */
  source: string;
}

/**
 * Busca la celda entregable de la etapa `stageNumber`. Si el número del marcador no coincide con el de la etapa
 * (R16) se rechaza con un error explícito; nunca se asume cuál es la correcta.
 */
export function findDeliverable(cells: NotebookCell[], stageNumber: number): Deliverable {
  const markers = cells.map((cell) => ({ cell, match: MARKER.exec(firstLine(cell)) })).filter((m) => m.match);
  const exact = markers.filter((m) => Number(m.match![1]) === stageNumber);
  if (exact.length > 1) {
    throw new NotebookError(`Hay ${exact.length} celdas con \`# Entregable - Etapa ${stageNumber}:\`. Deja solo una para poder verificarla.`, 'marcador_duplicado');
  }
  if (exact.length === 1) return { kind: exact[0]!.cell.kind, source: exact[0]!.cell.source };
  if (markers.length > 0) {
    const found = markers.map((m) => `Etapa ${m.match![1]}`).join(', ');
    throw new NotebookError(
      `Esta verificación es de la Etapa ${stageNumber}, pero el notebook solo tiene marcadores de: ${found}. ` +
        `Corrige el número del marcador \`# Entregable - Etapa ${stageNumber}:\`; no asumo cuál es la correcta.`,
      'etapa_no_coincide',
    );
  }
  throw new NotebookError(
    `No encontré la celda \`# Entregable - Etapa ${stageNumber}:\`. Su primera línea debe ser exactamente ese marcador.`,
    'celda_no_encontrada',
  );
}

/** Celdas de código cuya primera línea es `# Datos`, en orden (R27). */
export function dataCells(cells: NotebookCell[]): string[] {
  return cells.filter((c) => c.kind === 'code' && /^#\s*Datos\b/i.test(firstLine(c))).map((c) => c.source);
}

/** Texto que escribió el usuario en una celda markdown entregable (sin la línea del marcador). */
export function markdownAnswer(source: string): string {
  return source.split(/\r?\n/).slice(1).join('\n').trim();
}
