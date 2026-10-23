import type { AgentRole, RunSummary } from '../../../shared/agentes';

export const ROL_LABEL: Record<AgentRole, string> = {
  generador: 'Generador',
  'evaluador-codigo': 'Evaluador de código',
  'evaluador-conceptual': 'Evaluador conceptual',
  analista: 'Analista',
  planificador: 'Planificador',
};

/** Qué hace cada agente, en una línea (se muestra en su tarjeta). */
export const ROL_ROLE: Record<AgentRole, string> = {
  generador: 'Escribe el challenge por fases',
  'evaluador-codigo': 'Explica el resultado de tu código',
  'evaluador-conceptual': 'Evalúa tus respuestas con la rúbrica',
  analista: 'Lee tus notas y mejora el grafo',
  planificador: 'Arma el plan de estudio de un objetivo',
};

export type OutcomeFilter = 'todas' | 'ok' | 'fallo';
export const OUTCOME_LABEL: Record<RunSummary['outcome'], string> = {
  en_curso: 'En ejecución',
  ok: 'Correcta',
  error: 'Con error',
  cancelado: 'Cancelada',
  presupuesto: 'Sin presupuesto',
  interrumpida: 'Interrumpida',
};

const FAILED = new Set<RunSummary['outcome']>(['error', 'presupuesto', 'interrumpida']);
export const isFailure = (r: Pick<RunSummary, 'outcome'>): boolean => FAILED.has(r.outcome);

export interface RunFilters {
  roles: ReadonlySet<AgentRole>;
  outcome: OutcomeFilter;
  challengeId: string | null;
}

/** Filtra la línea de tiempo (R48b): sin roles elegidos se ven todos. */
export function filterRuns(runs: readonly RunSummary[], f: RunFilters): RunSummary[] {
  return runs.filter(
    (r) =>
      (f.roles.size === 0 || f.roles.has(r.rol)) &&
      (f.outcome === 'todas' || (f.outcome === 'ok' ? r.outcome === 'ok' : isFailure(r))) &&
      (f.challengeId === null || r.challengeId === f.challengeId),
  );
}

/** Challenges que aparecen en el registro, para el filtro (más recientes primero). */
export function challengesIn(runs: readonly RunSummary[]): string[] {
  const seen: string[] = [];
  for (const r of runs) if (r.challengeId && !seen.includes(r.challengeId)) seen.push(r.challengeId);
  return seen;
}

export interface Handoff {
  run: RunSummary;
  /** Primera ejecución de un rol distinto al anterior: ahí hay un traspaso. */
  from: AgentRole | null;
}

/**
 * Cadena de ejecuciones de un challenge en orden cronológico (R47): cada cambio de rol es un traspaso por artefactos
 * (challenge publicado → Evaluador → Evidence → Analista), nunca una conversación.
 */
export function handoffChain(runs: readonly RunSummary[], challengeId: string): Handoff[] {
  const chain = runs.filter((r) => r.challengeId === challengeId).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
  return chain.map((run, i) => ({ run, from: i > 0 && chain[i - 1]!.rol !== run.rol ? chain[i - 1]!.rol : null }));
}

/** Lo que pasó en cada traspaso, en español. */
export function handoffText(from: AgentRole, to: AgentRole): string {
  if (from === 'generador') return `${ROL_LABEL[to]} trabaja sobre el challenge que publicó el Generador.`;
  if (to === 'analista') return 'El Analista lee la Evidence que quedó registrada.';
  return `${ROL_LABEL[to]} continúa tras ${ROL_LABEL[from]}.`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(s % 60).padStart(2, '0')} s`;
}

export const formatUsd = (n: number): string => `US$ ${n.toFixed(2).replace('.', ',')}`;
