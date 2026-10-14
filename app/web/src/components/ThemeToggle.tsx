import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemePreference } from '../theme/theme';
import styles from './ThemeToggle.module.css';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'claro', label: 'Claro', icon: Sun },
  { value: 'oscuro', label: 'Oscuro', icon: Moon },
  { value: 'sistema', label: 'Sistema', icon: Monitor },
];

/** Selector de tema (HU19): grupo de radios con icono y texto. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className={styles.group} role="radiogroup" aria-label="Tema de la aplicación">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <label key={value} className={`${styles.opt} ${preference === value ? styles.active : ''}`} title={label}>
          <input type="radio" name="tema" className="visually-hidden" checked={preference === value} onChange={() => setPreference(value)} />
          <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="visually-hidden">{label}</span>
        </label>
      ))}
    </div>
  );
}
