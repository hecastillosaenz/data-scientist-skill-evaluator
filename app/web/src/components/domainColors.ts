import type { DomainId } from '../../../shared/types';

/** Variable CSS de la serie de cada dominio en los gráficos. */
export const DOMAIN_COLOR_VAR: Record<DomainId, string> = {
  sql: '--s1',
  python: '--s2',
  math: '--s3',
  ml: '--s4',
  features: '--s7',
  training: '--s8',
  cleaning: '--s5',
  business: '--s6',
};
