import { useCallback, useEffect, useRef, useState } from 'react';
import type { Apoyo } from '../../../../shared/types';
import type { VerifyEvent } from '../../../../shared/verify';
import { cancelledState, interruptedState, readNdjson, reduceVerify, startedState, type VerifyState } from '../../domain/verifyState';

export interface VerifyRun {
  stageId: string;
  challengeId: string;
  stageNumber: number;
  apoyo: Apoyo;
  /** Challenge real (endpoint del orquestador) o de ejemplo (eventos simulados). */
  real: boolean;
  /** Fuente de eventos simulados para los challenges de ejemplo. */
  simulate: (signal: AbortSignal) => AsyncIterable<VerifyEvent>;
}

async function* streamFromServer(run: VerifyRun, signal: AbortSignal): AsyncGenerator<VerifyEvent> {
  let res: Response;
  try {
    res = await fetch(`/api/challenges/${encodeURIComponent(run.challengeId)}/stages/${run.stageNumber}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apoyo: run.apoyo }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      yield { type: 'error', code: 'aborted', message: 'Verificación cancelada.' };
      return;
    }
    yield { type: 'error', code: 'network', message: 'No pude contactar al orquestador local. ¿Sigue corriendo `npm run app`?' };
    return;
  }
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    yield { type: 'error', code: String(res.status), message: body?.message ?? `El orquestador respondió con un error (${res.status}).` };
    return;
  }
  try {
    yield* readNdjson(res.body);
  } catch (err) {
    if ((err as Error).name === 'AbortError') yield { type: 'error', code: 'aborted', message: 'Verificación cancelada.' };
    else throw err;
  }
}

/**
 * Ejecuta verificaciones y mantiene su estado por etapa (SDD R26). Devuelve el resultado final a `onResult`
 * para que la UI habilite «Registrar etapa». Solo corre una a la vez; cancelar corta el proceso en el servidor.
 */
export function useVerifier(onResult: (stageId: string, result: { status: import('../../../../shared/types').AttemptResult; summary: string }) => void) {
  const [states, setStates] = useState<Record<string, VerifyState>>({});
  const controllers = useRef(new Map<string, AbortController>());
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((c) => c.abort());
  }, []);

  const run = useCallback(async (job: VerifyRun) => {
    controllers.current.get(job.stageId)?.abort();
    const controller = new AbortController();
    controllers.current.set(job.stageId, controller);
    let state = startedState();
    const publish = (next: VerifyState) => {
      state = next;
      setStates((prev) => ({ ...prev, [job.stageId]: next }));
    };
    publish(state);
    try {
      const events = job.real ? streamFromServer(job, controller.signal) : job.simulate(controller.signal);
      for await (const event of events) {
        publish(reduceVerify(state, event));
        if (event.type === 'result') onResultRef.current(job.stageId, { status: event.status, summary: event.summary });
      }
      publish(interruptedState(state));
    } catch (err) {
      publish(reduceVerify(state, { type: 'error', code: 'client', message: (err as Error).message }));
    } finally {
      if (controllers.current.get(job.stageId) === controller) controllers.current.delete(job.stageId);
    }
  }, []);

  const cancel = useCallback((stageId: string) => {
    controllers.current.get(stageId)?.abort();
    setStates((prev) => (prev[stageId] && prev[stageId]!.phase === 'running' ? { ...prev, [stageId]: cancelledState(prev[stageId]!) } : prev));
  }, []);

  const anyRunning = Object.values(states).some((s) => s.phase === 'running');
  return { states, run, cancel, anyRunning };
}
