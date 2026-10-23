import type { Foco, TemaPedido } from '../../shared/objetivos';
import type { AppData } from '../../shared/types';
import { computeInsights } from '../../web/src/domain/conceptState';
import { computeFocoProgress } from '../../web/src/domain/objetivoProgress';
import { ObjetivosError, readObjetivos } from '../persistence/objetivos-store';

export type ObjetivoElegido = { ok: true; foco: Foco; tema?: TemaPedido } | { ok: false; message: string };

/**
 * Un challenge pedido «para un objetivo» (R58): el tema es el siguiente concepto de su plan que aún no cumples (con tu
 * avance medido, R56). Sin plan, o con el plan cumplido, no hay tema fijo: el objetivo solo orienta el plan y el
 * contexto. Si el usuario escribe un tema, manda el suyo (se resuelve fuera de aquí).
 */
export async function elegirObjetivo(repoRoot: string, focoId: string, data: Pick<AppData, 'concepts' | 'challenges' | 'evidence' | 'testResults'>): Promise<ObjetivoElegido> {
  let foco: Foco | undefined;
  try {
    const objetivos = await readObjetivos(repoRoot, { conceptIds: new Set(data.concepts.map((c) => c.id)), focosActivosMax: Number.MAX_SAFE_INTEGER });
    foco = objetivos.focos.find((f) => f.id === focoId);
  } catch (err) {
    if (err instanceof ObjetivosError) return { ok: false, message: err.message };
    throw err;
  }
  if (!foco) return { ok: false, message: `No encuentro el objetivo «${focoId}». Guarda tus objetivos primero.` };
  if (foco.estado === 'logrado') return { ok: false, message: `El objetivo «${foco.titulo}» ya está logrado.` };
  const progress = computeFocoProgress(foco, data, computeInsights(data.concepts, data.challenges, data.evidence, data.testResults));
  const next = progress.next;
  return { ok: true, foco, ...(next ? { tema: { conceptId: next.paso.conceptId, texto: `${foco.titulo}: ${next.concept?.name ?? next.paso.conceptId}`.slice(0, 120) } } : {}) };
}

/** Modelo pedido por el usuario: un alias (`opus`, `sonnet`, `haiku`) o un id completo. Vacío = el predeterminado. */
export const MODELO_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._\-\[\]]{0,59}$/;
