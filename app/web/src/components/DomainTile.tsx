import { ChartColumn, Dumbbell, Sigma, Wrench } from 'lucide-react';
import { siPandas, siPostgresql, siPython, siScikitlearn } from 'simple-icons';
import type { DomainId } from '../../../shared/types';
import { DOMAIN_BY_ID } from '../../../shared/domains';
import styles from './DomainTile.module.css';

const BRAND: Partial<Record<DomainId, { path: string; hex: string }>> = {
  sql: siPostgresql,
  python: siPython,
  ml: siScikitlearn,
  cleaning: siPandas,
};

interface Props {
  domain: DomainId;
  /** `mono` para tablas/listas, `color` para encabezados. */
  variant?: 'mono' | 'color';
  size?: number;
}

export function DomainIcon({ domain, color, size = 18 }: { domain: DomainId; color?: boolean; size?: number }) {
  const brand = BRAND[domain];
  if (brand) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={color ? `#${brand.hex}` : 'currentColor'}>
        <path d={brand.path} />
      </svg>
    );
  }
  const Glyph = domain === 'math' ? Sigma : domain === 'features' ? Wrench : domain === 'training' ? Dumbbell : ChartColumn;
  return <Glyph size={size} strokeWidth={1.5} aria-hidden="true" color={color ? 'var(--accent)' : 'currentColor'} />;
}

export function DomainTile({ domain, variant = 'mono', size = 32 }: Props) {
  return (
    <span
      className={`${styles.tile} ${variant === 'color' ? styles.color : styles.mono}`}
      style={{ width: size, height: size }}
      title={DOMAIN_BY_ID[domain].name}
      role="img"
      aria-label={DOMAIN_BY_ID[domain].name}
    >
      <DomainIcon domain={domain} color={variant === 'color'} size={Math.round(size * 0.56)} />
    </span>
  );
}
