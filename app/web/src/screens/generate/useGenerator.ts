import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerateEvent, PendingGeneration, PropuestaReto } from '../../../../shared/generate';
import type { TemaPedido } from '../../../../shared/objetivos';
import type { DomainId } from '../../../../shared/types';
import type { ChallengePlan } from '../../../../server/generator/plan';
import { cancelledGenerate, interruptedGenerate, reduceGenerate, startedGenerate, type GenerateState } from '../../domain/generateState';
import { readNdjson } from '../../domain/verifyState';

export interface GenerateRequest {
  dominio?: DomainId;
  /** Tema a pedido ya resuelto a un concepto (R43). */
  tema?: TemaPedido;
  /** Lo que la persona quiere lograr y la propuesta del Planificador que aceptó (R61). */
  descripcion?: string;
  propuesta?: PropuestaReto;
  /** Etapas (2–6) y si es un proyecto de punta a punta (R60). */
  etapas?: number;
  proyecto?: boolean;
  /** Objetivo para el que se genera (R58). */
  focoId?: string;
  /** Modelo del Generador: alias o id; sin valor, el predeterminado. */
  modelo?: string;
  /** Retoma el trabajo conservado desde la última fase válida (R39). */
  resume?: boolean;
  /** 2 = «Reintentar con el doble de presupuesto». */
  budgetFactor?: 1 | 2;
}

async function* stream(request: GenerateRequest, signal: AbortSignal): AsyncGenerator<GenerateEvent> {
  let res: Response;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') yield { type: 'error', code: 'aborted', message: 'Generación cancelada.' };
    else yield { type: 'error', code: 'internal', message: 'No pude contactar al orquestador local. ¿Sigue corriendo `npm run app`?' };
    return;
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    yield { type: 'error', code: 'conflict', message: body?.message ?? `El orquestador respondió con un error (${res.status}).` };
    return;
  }
  try {
    yield* readNdjson<GenerateEvent>(res.body);
  } catch (err) {
    if ((err as Error).name === 'AbortError') yield { type: 'error', code: 'aborted', message: 'Generación cancelada.' };
    else throw err;
  }
}

/** Lanza una generación y mantiene su estado en vivo; cancelar corta el proceso en el servidor y borra su área de trabajo. */
export function useGenerator(onResult: () => void) {
  const [state, setState] = useState<GenerateState | null>(null);
  const controller = useRef<AbortController | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async (request: GenerateRequest) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    let current = startedGenerate();
    const publish = (next: GenerateState) => {
      current = next;
      setState(next);
    };
    publish(current);
    try {
      for await (const event of stream(request, abort.signal)) {
        publish(reduceGenerate(current, event));
        if (event.type === 'result') onResultRef.current();
      }
      publish(interruptedGenerate(current));
    } catch (err) {
      publish(reduceGenerate(current, { type: 'error', code: 'internal', message: (err as Error).message, canResume: true }));
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setState((s) => (s && s.phase === 'running' ? cancelledGenerate(s) : s));
  }, []);

  const reset = useCallback(() => setState(null), []);
  return { state, start, cancel, reset };
}

/** Vista previa del plan (R38) y trabajo conservado (R39) para el diálogo; ambos son de solo lectura. */
export function usePlanPreview(open: boolean, dominio: DomainId | null, tema: TemaPedido | null = null, focoId: string | null = null, forma: { etapas: number | null; proyecto: boolean } = { etapas: null, proyecto: false }) {
  const [plan, setPlan] = useState<ChallengePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingGeneration | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPlan(null);
    setError(null);
    const query = new URLSearchParams();
    if (dominio) query.set('dominio', dominio);
    if (tema) {
      query.set('concepto', tema.conceptId);
      query.set('tema', tema.texto);
    }
    if (focoId) query.set('foco', focoId);
    if (forma.etapas) query.set('etapas', String(forma.etapas));
    if (forma.proyecto) query.set('proyecto', '1');
    fetch(`/api/plan${query.size > 0 ? `?${query}` : ''}`)
      .then(async (res) => {
        const body = (await res.json()) as ChallengePlan & { message?: string };
        if (cancelled) return;
        if (!res.ok) setError(body.message ?? 'No pude calcular el plan.');
        else setPlan(body);
      })
      .catch(() => !cancelled && setError('No pude contactar al orquestador local.'));
    return () => {
      cancelled = true;
    };
  }, [open, dominio, tema, focoId, forma.etapas, forma.proyecto]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/generate/pending')
      .then((res) => res.json() as Promise<{ pending: PendingGeneration | null }>)
      .then((body) => !cancelled && setPending(body.pending))
      .catch(() => !cancelled && setPending(null));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return { plan, error, pending };
}

/** Pide al Planificador que aterrice lo que quieres lograr en conceptos, Bloom y número de etapas (R61). Tarda unos segundos. */
export async function proponerReto(
  body: { descripcion?: string; tema?: TemaPedido; focoId?: string; dominio?: DomainId; etapas: number | null; proyecto: boolean | null },
  signal?: AbortSignal,
): Promise<{ propuesta: PropuestaReto; cost: number }> {
  const res = await fetch('/api/generate/propuesta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  const data = (await res.json().catch(() => ({}))) as { propuesta?: PropuestaReto; cost?: number; message?: string };
  if (!res.ok || !data.propuesta) throw new Error(data.message ?? `El orquestador respondió con un error (${res.status}).`);
  return { propuesta: data.propuesta, cost: data.cost ?? 0 };
}
