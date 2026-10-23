import type { MensajeFoco, Objetivos, PlanFoco } from '../../../shared/objetivos';

export interface ObjetivosLimites {
  focosActivosMax: number;
  materialMaxCaracteres: number;
}

export async function loadObjetivos(): Promise<{ objetivos: Objetivos; limites: ObjetivosLimites }> {
  const res = await fetch('/api/objetivos');
  const body = (await res.json()) as { objetivos?: Objetivos; limites?: ObjetivosLimites; message?: string };
  if (!res.ok || !body.objetivos || !body.limites) throw new Error(body.message ?? `El orquestador respondió con un error (${res.status}).`);
  return { objetivos: body.objetivos, limites: body.limites };
}

/** Guarda el archivo completo; si el orquestador lo rechaza, lanza con todos los motivos. */
export async function saveObjetivos(objetivos: Objetivos): Promise<Objetivos> {
  const res = await fetch('/api/objetivos', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(objetivos) });
  const body = (await res.json()) as { objetivos?: Objetivos; message?: string; errors?: string[] };
  if (!res.ok || !body.objetivos) throw new Error(body.errors?.join(' ') ?? body.message ?? `El orquestador respondió con un error (${res.status}).`);
  return body.objetivos;
}

export interface MaterialScan {
  carpeta: string;
  dir: string | null;
  files: { path: string; kind: 'pdf' | 'md' | 'txt' | 'ipynb'; bytes: number }[];
  skipped: { path: string; reason: string }[];
  problem?: string;
}

export async function scanCarpeta(carpeta: string): Promise<MaterialScan> {
  const res = await fetch(`/api/material?carpeta=${encodeURIComponent(carpeta)}`);
  if (!res.ok) throw new Error(`El orquestador respondió con un error (${res.status}).`);
  return (await res.json()) as MaterialScan;
}

/** Pide al Planificador el plan de un foco ya guardado (R56). Tarda; `signal` cancela el agente. */
export async function crearPlan(focoId: string, signal?: AbortSignal): Promise<{ plan: PlanFoco; cost: number }> {
  const res = await fetch(`/api/objetivos/${encodeURIComponent(focoId)}/plan`, { method: 'POST', ...(signal ? { signal } : {}) });
  const body = (await res.json().catch(() => ({}))) as { plan?: PlanFoco; cost?: number; message?: string };
  if (!res.ok || !body.plan) throw new Error(body.message ?? `El orquestador respondió con un error (${res.status}).`);
  return { plan: body.plan, cost: body.cost ?? 0 };
}

/** Feedback al Planificador o petición de revisión de avance (R57). Tarda; `signal` cancela el agente. */
export async function conversarFoco(focoId: string, body: { accion: 'feedback' | 'revision'; texto?: string }, signal?: AbortSignal): Promise<{ mensajes: MensajeFoco[]; plan: PlanFoco | null; planCambiado: boolean }> {
  const res = await fetch(`/api/objetivos/${encodeURIComponent(focoId)}/conversacion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  const data = (await res.json().catch(() => ({}))) as { mensajes?: MensajeFoco[]; plan?: PlanFoco | null; planCambiado?: boolean; message?: string };
  if (!res.ok || !data.mensajes) throw new Error(data.message ?? `El orquestador respondió con un error (${res.status}).`);
  return { mensajes: data.mensajes, plan: data.plan ?? null, planCambiado: data.planCambiado ?? false };
}
