import type { Objetivos } from '../../../shared/objetivos';

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
