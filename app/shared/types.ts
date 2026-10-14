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

/** Valor de una celda de muestra; `null` se muestra como NULL. */
export type Cell = string | number | boolean | null;

export interface TableColumn {
  name: string;
  type: string;
  pk?: boolean;
  /** Llave foránea hacia `table.column`. */
  fk?: { table: string; column: string };
  nullable?: boolean;
}

export interface TableDef {
  name: string;
  description?: string;
  columns: TableColumn[];
  rowCount: number;
  /** Primeras filas, en el orden de `columns`. */
  sampleRows: Cell[][];
}

/** Datos sintéticos del challenge (R18): `seedSql` para DuckDB o `seedPython` con semilla fija. */
export interface Dataset {
  engine: 'duckdb' | 'pandas';
  tables: TableDef[];
  seedSql?: string;
  seedPython?: string;
}

export interface TheoryItem {
  title: string;
  /** Markdown con fórmulas ($…$ / $$…$$). */
  body: string;
}

export interface ResearchItem {
  conceptId: string;
  why: string;
  searchEs: string;
  searchEn: string;
}

export interface ExpectedTable {
  columns: string[];
  rows: Cell[][];
}

export interface StageSolution {
  code?: string;
  expectedResult?: string;
  reasoning?: string;
  conceptLinks?: string;
  businessInterpretation?: string;
  commonError?: string;
  dsFlow?: string;
  skill?: string;
}

/** Contenido rico de una etapa (R17). Todo es opcional; la UI oculta lo que falte. */
export interface StageContent {
  theory?: TheoryItem[];
  workedExample?: { domain: string; body: string };
  /** Paso a paso (Apoyo Guiado). */
  steps?: string[];
  /** Pistas ordenadas: qué mirar, no cómo (Apoyo Pistas). */
  hints?: string[];
  skeleton?: { language: 'sql' | 'python'; code: string };
  research?: ResearchItem[];
  /** Entregable como checklist. */
  deliverables?: string[];
  expected?: ExpectedTable;
  asserts?: string;
  solution?: StageSolution;
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
  /** Tarea de la etapa (Markdown). */
  description: string;
  /** Conceptos del grafo que practica la etapa. */
  conceptIds: string[];
  /** Apoyo actual de la etapa; independiente de las demás (R5). */
  apoyo: Apoyo;
  content: StageContent;
}

export interface BusinessQuestion {
  id: string;
  text: string;
  /** Guía de reflexión: se muestra solo tras guardar las respuestas (R22). */
  reflectionGuide?: string;
}

export interface TestQuestion {
  id: string;
  conceptId: string;
  bloom: 1 | 2 | 3;
  kind: 'opcion_multiple' | 'numerica' | 'texto';
  /** Markdown. */
  prompt: string;
  options?: string[];
  correctIndex?: number;
  answer?: number;
  tolerance?: number;
  /** Criterio de la rúbrica para `texto`. */
  rubric?: string;
  explanation: string;
}

export interface Challenge {
  id: string;
  number: number;
  title: string;
  dataset: string;
  difficulty: Difficulty;
  /** Sugerido por la cola de repaso. El estado del challenge se deriva de la evidencia. */
  recommended: boolean;
  /** Escenario de negocio: rol, organización y decisión (Markdown). */
  scenario: string;
  /** Tarea concreta del challenge (Markdown). */
  task: string;
  data?: Dataset;
  businessQuestions: BusinessQuestion[];
  finalTest?: TestQuestion[];
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
  /** `cronometro` si salió del timekeeper; `manual` si el usuario lo editó (R20). Ausente en datos previos al cronómetro. */
  timeSource?: 'cronometro' | 'manual';
  blocker?: Blocker;
  notes?: string;
}

/** Respuesta a una pregunta de negocio (R22). Append-only: guardar de nuevo crea otro registro. */
export interface BusinessAnswer {
  id: string;
  challengeId: string;
  questionId: string;
  /** ISO 8601. */
  at: string;
  text: string;
}

export interface AppData {
  user: { name: string };
  /** ISO 8601 del "ahora" de los datos de ejemplo. */
  now: string;
  concepts: Concept[];
  challenges: Challenge[];
  evidence: Evidence[];
  businessAnswers: BusinessAnswer[];
}
