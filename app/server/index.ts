import { spawn } from 'node:child_process';
import { buildApp } from './app';
import { DEFAULT_PORT, startServer } from './start';

function openBrowser(url: string): void {
  const [cmd, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

const app = await buildApp({
  autoAnalyze: true,
  onAnalysisSettled: (id, outcome) => {
    const cost = 'cost' in outcome ? ` · US$ ${outcome.cost.toFixed(4)}` : '';
    const detail = outcome.status === 'error' ? ` · ${outcome.message}` : '';
    console.log(`Analista: ${id} → ${outcome.status}${cost}${detail}`);
  },
});
const url = await startServer(app, Number(process.env.PORT ?? DEFAULT_PORT));
console.log(`Orquestador local en ${url}`);
if (process.argv.includes('--open')) openBrowser(url);
