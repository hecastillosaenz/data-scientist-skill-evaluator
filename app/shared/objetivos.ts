import type { Bloom } from './types';

/** Objetivos de aprendizaje del usuario (SDD R44): `configuracion-retos/objetivos.json`. */
export type FocoEstado = 'activo' | 'pausado' | 'logrado';

/** Un paso del plan de estudio de un foco: un concepto del grafo y a qué nivel de Bloom llegar. */
export interface PlanPaso {
  conceptId: string;
  bloom: Bloom;
  /** Por qué este concepto, a este nivel y en este punto de la ruta. */
  porque: string;
}

/** Plan de un foco (R56): lo propone el Planificador y solo sesga los retos una vez aceptado. */
export type PlanEstado = 'propuesto' | 'aceptado';
export interface PlanFoco {
  estado: PlanEstado;
  creadoAt: string;
  resumen: string;
  /** Ordenados: los prerrequisitos van antes. */
  pasos: PlanPaso[];
}

/** Conversación con el Planificador dentro de un objetivo (R57): tu feedback, sus respuestas y sus revisiones de avance. */
export interface MensajeFoco {
  id: string;
  /** ISO 8601. */
  at: string;
  rol: 'usuario' | 'planificador';
  /** `feedback` y `revision` los pide el usuario; `respuesta` contesta a un feedback. */
  tipo: 'feedback' | 'revision' | 'respuesta';
  texto: string;
  /** La respuesta cambió el plan (queda como propuesto). */
  planCambiado?: boolean;
}
export const MENSAJE_ROLES: readonly MensajeFoco['rol'][] = ['usuario', 'planificador'];
export const MENSAJE_TIPOS: readonly MensajeFoco['tipo'][] = ['feedback', 'revision', 'respuesta'];
export const CONVERSACION_MAX = 40;
export const MENSAJE_MAX_USUARIO = 2000;
export const MENSAJE_MAX_ALMACENADO = 6000;

export const PLAN_MAX_PASOS = 14;
export const PLAN_ESTADOS: readonly PlanEstado[] = ['propuesto', 'aceptado'];

export interface Foco {
  id: string;
  titulo: string;
  estado: FocoEstado;
  /** Conceptos sueltos del grafo (legado, R44): con un plan aceptado, manda el plan. */
  conceptIds: string[];
  /** Objetivos de estudio en texto libre: qué quieres lograr. Contexto para el Planificador y el Generador, nunca instrucciones (R45). */
  material: string;
  /** Principal fuente de estudio: carpeta del repo con PDF, apuntes y notebooks (R49); opcional. */
  carpeta?: string;
  /** Plan de estudio del foco, si ya se creó. */
  plan?: PlanFoco;
  /** Feedback tuyo y respuestas del Planificador sobre este objetivo (R57); las más recientes. */
  conversacion?: MensajeFoco[];
  /** Fechas `YYYY-MM-DD` de referencia (R44): no cierran el foco ni cambian el plan. */
  desde?: string;
  hasta?: string;
}

export interface Objetivos {
  version: 1;
  /** Rol del usuario, p. ej. «Data Scientist». */
  rol: string;
  focos: Foco[];
}

export const EMPTY_OBJETIVOS: Objetivos = { version: 1, rol: '', focos: [] };
export const FOCO_ESTADOS: readonly FocoEstado[] = ['activo', 'pausado', 'logrado'];
export const MAX_MATERIAL_ALMACENADO = 40_000;

/** Tema pedido para un challenge (R43): el concepto ya resuelto y el texto original. */
export interface TemaPedido {
  conceptId: string;
  texto: string;
}
