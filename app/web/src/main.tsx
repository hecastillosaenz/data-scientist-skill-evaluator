import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';
import { ThemeProvider } from './theme/ThemeProvider';
import { TimekeeperProvider } from './data/TimekeeperContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TimekeeperProvider>
        <App />
      </TimekeeperProvider>
    </ThemeProvider>
  </StrictMode>,
);
