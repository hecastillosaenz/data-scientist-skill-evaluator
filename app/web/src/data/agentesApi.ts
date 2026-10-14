import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentesPayload, RunRecord } from '../../../shared/agentes';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.message ?? `El orquestador respondió con un error (${res.status}).`);
  return body;
}

export const loadRun = (id: string): Promise<RunRecord> => getJson<RunRecord>(`/api/agentes/ejecuciones/${id}`);

/**
 * El estado de los agentes (R48): se actualiza solo. Mientras algo corre consulta cada 2 s; en reposo, cada 15 s, y se
 * detiene con la pestaña oculta. Solo lee: nunca lanza ni reintenta nada.
 */
export function useAgentes() {
  const [data, setData] = useState<AgentesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = data?.agentes.some((a) => a.enCurso) ?? false;
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await getJson<AgentesPayload>('/api/agentes');
      if (!alive.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (alive.current) setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, running ? 2000 : 15_000);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, refresh]);

  return { data, error, refresh };
}
