import type { Observation } from './types';

/**
 * Registro de ejecuciones de agentes (SDD R46–R48): tipos compartidos entre el orquestador, que escribe y lee los
 * archivos de `registro-agentes/`, y la ventana de monitoreo del navegador.
 */
export type AgentRole = 'generador' | 'evaluador-codigo' | 'evaluador-conceptual' | 'analista';
export const AGENT_ROLES: readonly AgentRole[] = ['generador', 'evaluador-codigo', 'evaluador-conceptual', 'analista'];
export type RunOutcome = 'en_curso' | 'ok' | 'error' | 'cancelado' | 'presupuesto' | 'interrumpida';

/** A qué pertenece la ejecución: sirve para enlazar los traspasos entre roles (R47). */
export interface RunMeta {
  challengeId?: string;
  stageId?: string;
  /** Fase del Generador (`esqueleto`, `etapa-2`, `test`…). */
  fase?: string;
  evidenceId?: string;
}

export interface RunEventLog {
  type: 'text' | 'tool';
  text: string;
}

export interface RunRecord extends RunMeta {
  id: string;
  rol: AgentRole;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  outcome: RunOutcome;
  /** Tope de presupuesto de la llamada en US$ (`--max-budget-usd`). */
  maxUsd?: number;
  cost: number;
  errorCode?: string;
  errorMessage?: string;
  /** Mensaje que recibió el agente (por stdin). */
  input: string;
  inputTruncated?: boolean;
  events: RunEventLog[];
  eventsTruncated?: boolean;
  output?: string;
  outputTruncated?: boolean;
}

/** Lo que lista la pantalla: sin el mensaje, los eventos ni la salida (esos se piden al abrir una ejecución). */
export type RunSummary = Omit<RunRecord, 'input' | 'inputTruncated' | 'events' | 'eventsTruncated' | 'output' | 'outputTruncated'> & { eventCount: number };


/** Estado de uno de los cuatro agentes para la ventana de monitoreo (SDD R48a). */
export interface AgentStatus {
  rol: AgentRole;
  enCurso: boolean;
  ultima: RunSummary | null;
  costoHoy: number;
  costoTotal: number;
  ejecuciones: number;
  errores: number;
}

/** Lo que el Analista dejó anotado sobre una Evidence (R48d). */
export interface AnalysisEntry {
  observation: Observation;
  challengeId: string | null;
  runId: string | null;
}

export interface AgentesPayload {
  agentes: AgentStatus[];
  /** Las más recientes primero; el detalle (mensaje, eventos, salida) se pide aparte. */
  ejecuciones: RunSummary[];
  /** Últimos análisis del Analista con hallazgos (sin las Evidence omitidas). */
  analisis: AnalysisEntry[];
  /** Conceptos que el Analista creó, más recientes primero. */
  conceptosCreados: { id: string; name: string; since: string }[];
  errores: RunSummary[];
  /** Días que se conserva el registro y cuántas ejecuciones se están mostrando del total. */
  retencionDias: number;
  total: number;
}
