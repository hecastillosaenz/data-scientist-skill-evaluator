import { NavLink, Outlet } from 'react-router';
import { ChartLine, House, ListChecks, Network, PlayCircle, RefreshCw } from 'lucide-react';
import { SampleDataTag } from '../components/cards';
import { GapDialog } from '../components/GapDialog';
import { GlobalTimer } from '../components/GlobalTimer';
import { ThemeToggle } from '../components/ThemeToggle';
import { USING_SAMPLE_DATA } from '../data/repository';
import { useApp } from '../data/DataContext';
import styles from './AppShell.module.css';

const NAV = [
  { to: '/', label: 'Inicio', short: 'Inicio', icon: House, end: true },
  { to: '/challenges', label: 'Challenges', short: 'Retos', icon: ListChecks },
  { to: '/challenge-actual', label: 'Challenge actual', short: 'Actual', icon: PlayCircle },
  { to: '/repaso', label: 'Repaso', short: 'Repaso', icon: RefreshCw },
  { to: '/grafo', label: 'Grafo de conocimiento', short: 'Grafo', icon: Network },
  { to: '/analitica', label: 'Analítica', short: 'Analítica', icon: ChartLine },
];

export function AppShell() {
  const { data } = useApp();
  const name = data?.user.name ?? '';
  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Principal">
        <div className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">DS</span>
          <span className={styles.logoText}>Data Scientist Challenges</span>
        </div>
        <ul className={styles.list}>
          {NAV.map(({ to, label, short, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
                <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                <span className={styles.full}>{label}</span>
                <span className={styles.short}>{short}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className={styles.theme}>
          <ThemeToggle />
        </div>
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden="true">{name.slice(0, 1)}</span>
          <span>{name}</span>
        </div>
      </nav>
      <GlobalTimer />
      <GapDialog />
      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
          {USING_SAMPLE_DATA && (
            <footer className={styles.footer}>
              <SampleDataTag />
            </footer>
          )}
        </div>
      </main>
    </div>
  );
}
