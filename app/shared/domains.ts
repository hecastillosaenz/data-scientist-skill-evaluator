import type { Apoyo, Blocker, Bloom, ConceptState, DomainId, Difficulty, StageStatus } from './types';

export interface DomainInfo {
  id: DomainId;
  name: string;
  short: string;
}

export const DOMAINS: DomainInfo[] = [
  { id: 'sql', name: 'SQL', short: 'SQL' },
  { id: 'python', name: 'Python', short: 'Python' },
  { id: 'math', name: 'Matemática Aplicada', short: 'Matemática' },
  { id: 'ml', name: 'Machine Learning', short: 'ML' },
  { id: 'features', name: 'Feature Engineering', short: 'Features' },
  { id: 'training', name: 'Model Training', short: 'Training' },
  { id: 'cleaning', name: 'Limpieza y Visualización', short: 'Limpieza' },
  { id: 'business', name: 'Business Analytics', short: 'Business' },
];

export const DOMAIN_BY_ID = Object.fromEntries(DOMAINS.map((d) => [d.id, d])) as Record<DomainId, DomainInfo>;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado' };

export const BLOOM_LABEL: Record<Bloom, string> = {
  1: 'Recordar',
  2: 'Comprender',
  3: 'Aplicar',
  4: 'Analizar',
  5: 'Evaluar',
  6: 'Crear',
};

export const APOYO_LABEL: Record<Apoyo, string> = { guiado: 'Guiado', pistas: 'Pistas', autonomo: 'Autónomo' };

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  completada: 'Completada',
  con_fallos: 'Con fallos',
};

export const CONCEPT_STATE_LABEL: Record<ConceptState, string> = {
  no_visto: 'No visto',
  visto: 'Visto',
  dominado: 'Dominado',
  con_fallos: 'Con fallos',
};

export const BLOCKER_LABEL: Record<Blocker, string> = {
  concepto: 'No entendí el concepto',
  sintaxis: 'Sintaxis o API',
  enfoque: 'No supe por dónde empezar',
  datos: 'Problema con los datos',
  tiempo: 'Me faltó tiempo',
};
