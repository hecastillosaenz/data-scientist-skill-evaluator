/** Objetivos de aprendizaje del usuario (SDD R44): `configuracion-retos/objetivos.json`. */
export type FocoEstado = 'activo' | 'pausado' | 'logrado';

export interface Foco {
  id: string;
  titulo: string;
  estado: FocoEstado;
  /** Conceptos del grafo que toca este foco; sesgan el plan (R45). */
  conceptIds: string[];
  /** Temario o notas pegadas: contexto para el Generador, nunca instrucciones (R45). */
  material: string;
  /** Carpeta del repo con PDF, apuntes y notebooks (R49); relativa a la raíz y fuera de git. */
  carpeta?: string;
  /** Fechas `YYYY-MM-DD`, opcionales. */
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
