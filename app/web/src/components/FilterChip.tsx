import type { ReactNode } from 'react';
import styles from './FilterChip.module.css';

interface Props {
  children: ReactNode;
  count?: number;
  active: boolean;
  onClick: () => void;
}

export function FilterChip({ children, count, active, onClick }: Props) {
  return (
    <button type="button" className={`${styles.chip} ${active ? styles.active : ''}`} aria-pressed={active} onClick={onClick}>
      {children}
      {count !== undefined && <span className={`${styles.count} mono`}>{count}</span>}
    </button>
  );
}
