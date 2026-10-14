/** Contrato de datos compartido entre el frontend y (más adelante) el orquestador. */

export type DomainId = 'sql' | 'python' | 'math' | 'ml' | 'cleaning' | 'business';

export type Apoyo = 'guiado' | 'pistas' | 'autonomo';
export type Bloom = 1 | 2 | 3 | 4 | 5 | 6;
/** 1 = Básico, 2 = Intermedio, 3 = Avanzado. */
export type Difficulty = 1 | 2 | 3;

export type StageStatus = 'pendiente' | 'en_curso' | 'completada' | 'con_fallos';
export type ConceptState = 'no_visto' | 'visto' | 'dominado' | 'con_fallos';
/** Derivado de la evidencia de sus etapas, no se almacena. */
export type ChallengeStatus = 'en_curso' | 'pendiente' | 'completada';

/** Mecanismo de evaluación de una etapa (R3). */
export type EvalMechanism = 'codigo_assert' | 'rubric_claude';

export type AttemptResult = 'aprobada' | 'parcial' | 'fallida';

/** Respuestas de "¿Dónde te trabaste?". */
export type Blocker = 'concepto' | 'sintaxis' | 'enfoque' | 'datos' | 'tiempo';

export interface Concept {
  id: string;
  name: string;
  domain: DomainId;
  /** Ids de conceptos prerrequisito (pueden ser de otro dominio). */
  prerequisites: string[];
}

export interface TableSchema {
  table: string;
  columns: { name: string; type: string }[];
}

export interface Stage {
  /** Único en todo el sistema: `<challengeId>-s<number>`. */
  id: string;
  challengeId: string;
  number: number;
  title: string;
  domain: DomainId;
  difficulty: Difficulty;
  bloom: Bloom;
  estimatedMinutes: number;
  mechanism: EvalMechanism;
  description: string;
  deliverables: string[];
  conceptIds: string[];
  /** Apoyo actual de la etapa; independiente de las demás (R5). */
  apoyo: Apoyo;
  suggestedStep: string;
  hint: string;
  verification: string;
  solution: string;
}

export interface Challenge {
  id: string;
  number: number;
  title: string;
  dataset: string;
  difficulty: Difficulty;
  /** Sugerido por la cola de repaso. El estado del challenge se deriva de la evidencia. */
  recommended: boolean;
  statement: string;
  schema: TableSchema[];
  businessQuestions: string[];
  stages: Stage[];
}

/** Registro inmutable de un intento (R10): nunca se sobrescribe. */
export interface Evidence {
  id: string;
  challengeId: string;
  stageId: string;
  /** ISO 8601. */
  at: string;
  result: AttemptResult;
  /** El toggle de Solución se abrió antes de verificar (R7). */
  withHelp: boolean;
  apoyo: Apoyo;
  actualMinutes: number;
  blocker?: Blocker;
  notes?: string;
}

export interface AppData {
  user: { name: string };
  /** ISO 8601 del "ahora" de los datos de ejemplo. */
  now: string;
  concepts: Concept[];
  challenges: Challenge[];
  evidence: Evidence[];
}
