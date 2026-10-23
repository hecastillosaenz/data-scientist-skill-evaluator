import type { ChallengePlan } from '../server/generator/plan';

export type GenerateErrorCode =
  | 'no_claude'
  | 'budget'
  | 'invalid_output'
  | 'gate_failed'
  | 'calibration'
  | 'state'
  | 'objetivo'
  | 'propuesta'
  | 'conflict'
  | 'aborted'
  | 'internal';

/**
 * Lo que el Planificador entendió de lo que el usuario quiere lograr y cómo lo propone descomponer (R61): metas, cuántas
 * etapas y qué concepto del grafo y a qué nivel de Bloom trabaja cada una. El usuario la revisa antes de generar.
 */
export interface PropuestaReto {
  /** Qué entendió: las metas del reto en 1–3 frases. */
  meta: string;
  /** Total de etapas (2–6), incluida la de integración. */
  etapas: number;
  /** Una sola historia y un solo dataset encadenando las etapas (R60). */
  proyecto: boolean;
  /** Por qué ese número de etapas y esa descomposición. */
  razonEtapas: string;
  /** Una etapa técnica por paso, en orden. */
  pasos: { conceptId: string; bloom: 1 | 2 | 3 | 4 | 5 | 6; porque: string }[];
  /** Concepto de Business para la etapa final (reporte o interpretación), si el modelo propone uno. */
  integracion?: { conceptId: string; porque: string };
}

/** Lo que el Generador ya planteó del caso (fase de esqueleto, validada): para mostrar cómo se va armando. */
export interface CasoPreview {
  title: string;
  dataset: string;
  lookingFor: string;
  scenario: string;
  tables: { name: string; rows: number; columns: number }[];
  stages: { number: number; title: string; description: string; minutes: number }[];
}

/** Una etapa ya escrita y comprobada por el orquestador. */
export interface EtapaPreview {
  number: number;
  title: string;
  minutes: number;
  deliverables: string[];
  /** Cómo se comprobó: la solución de referencia reprodujo lo esperado, o la etapa conceptual tiene rúbrica. */
  checked: string;
}

/**
 * Eventos NDJSON de la generación de un challenge (SDD R39). Mismo patrón que la verificación: `step` con la fase y
 * su estado, `tool` con lo que lee el agente, y un `result` o un `error` antes de `done`.
 */
export type GenerateEvent =
  | { type: 'plan'; plan: ChallengePlan }
  | { type: 'step'; id: string; label: string; status: 'running' | 'ok' | 'error'; detail?: string; /** Costo de la fase en US$ (llamadas al Generador, reparaciones incluidas). */ cost?: number }
  | { type: 'tool'; text: string }
  | { type: 'caso'; caso: CasoPreview }
  | { type: 'etapa'; etapa: EtapaPreview }
  | { type: 'result'; challengeId: string; title: string }
  | {
      type: 'error';
      code: GenerateErrorCode;
      message: string;
      /** Fase en la que ocurrió (`esqueleto`, `etapa-2`, `test`, `publicar`…). */
      phase?: string;
      /** Hay trabajo ya validado que «Reintentar» puede retomar (R39). */
      canResume?: boolean;
    }
  | { type: 'done'; cost: number };

/** Lo que la UI necesita saber para ofrecer «Reintentar» tras recargar la página. */
export interface PendingGeneration {
  challengeId: string;
  /** Fases ya validadas (p. ej. `esqueleto`, `etapa-1`). */
  completed: string[];
  /** Antigüedad del trabajo conservado, en horas. */
  ageHours: number;
}
