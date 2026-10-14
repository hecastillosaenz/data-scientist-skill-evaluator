import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Wrapper sobre `spawn('claude', ...)` (SDD §6.4 / S2–S4). El servidor NO tiene API key ni habla con la API de
 * Anthropic: lanza Claude Code, que usa la sesión (suscripción) del usuario. Ningún rol tiene Bash (R9 revisado).
 */
export const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'] as const;
export const FORBIDDEN_TOOLS = ['Bash', 'PowerShell', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Agent'] as const;
export const DENIED_READS = ['Read(**/.env)', 'Read(**/.env.*)', 'Read(**/node_modules/**)', 'Read(**/.git/**)', 'Read(**/.venv/**)'];

export const DEFAULT_MAX_USD = 0.5;

export const claudeBin = (): string => process.env.CLAUDE_BIN || 'claude';

export function hasClaude(bin: string = claudeBin()): boolean {
  try {
    return spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

export interface BuildArgsOptions {
  system?: string;
  /** Carpetas fuera del cwd que el agente puede leer (solo `challenge/challenge-NNN/`). */
  addDirs?: string[];
  maxUsd?: number;
}

/** Argumentos de la invocación; exportado para poder comprobar R9 (sin Bash) y S4 (scope explícito) en los tests. */
export function buildArgs({ system, addDirs = [], maxUsd = DEFAULT_MAX_USD }: BuildArgsOptions): string[] {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'dontAsk',
    '--max-budget-usd', String(maxUsd),
    '--allowedTools', ...READ_ONLY_TOOLS,
    '--disallowedTools', ...FORBIDDEN_TOOLS,
    '--settings', JSON.stringify({ permissions: { deny: DENIED_READS } }),
    // Cada evaluación es independiente y no comparte contexto con el Generador (R14).
    '--no-session-persistence',
  ];
  if (system) args.push('--append-system-prompt', system);
  for (const dir of addDirs) args.push('--add-dir', path.resolve(dir));
  return args;
}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; text: string };

export interface AgentRunOptions extends BuildArgsOptions {
  /** Mensaje del usuario: va por stdin, nunca como argumento. */
  message: string;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  /** Binario a ejecutar (por defecto `CLAUDE_BIN` o `claude`). */
  bin?: string;
}

export interface AgentResult {
  text: string;
  cost: number;
  sessionId: string | null;
}

export class AgentError extends Error {
  constructor(message: string, readonly code: 'no_claude' | 'agent_failed' | 'aborted') {
    super(message);
    this.name = 'AgentError';
  }
}

/** Interpreta una línea de `stream-json`; devuelve los eventos de interés y datos del resultado final. */
export function parseStreamLine(line: string): { events: AgentEvent[]; sessionId?: string; cost?: number; error?: string } | null {
  let e: Record<string, any>;
  try {
    e = JSON.parse(line);
  } catch {
    return null;
  }
  const out: { events: AgentEvent[]; sessionId?: string; cost?: number; error?: string } = { events: [] };
  if (typeof e.session_id === 'string') out.sessionId = e.session_id;
  if (e.type === 'assistant') {
    for (const block of e.message?.content ?? []) {
      if (block.type === 'text' && block.text) out.events.push({ type: 'text', text: block.text });
      else if (block.type === 'tool_use') {
        const target = block.input?.file_path || block.input?.path || block.input?.pattern || '';
        out.events.push({ type: 'tool', text: `${block.name} ${target}`.trim() });
      }
    }
  } else if (e.type === 'result') {
    out.cost = typeof e.total_cost_usd === 'number' ? e.total_cost_usd : 0;
    if (e.is_error) out.error = e.result || 'Claude Code terminó con error';
  }
  return out;
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentResult> {
  const bin = opts.bin ?? claudeBin();
  if (!hasClaude(bin)) {
    throw new AgentError('No encuentro Claude Code. Instálalo y ejecuta «claude» una vez en una terminal para iniciar sesión.', 'no_claude');
  }

  // cwd neutro: así el agente no hereda el CLAUDE.md ni la configuración de ningún repositorio (S3).
  const cwd = path.join(tmpdir(), 'dsc-agent');
  mkdirSync(cwd, { recursive: true });

  const child = spawn(bin, buildArgs(opts), {
    cwd,
    // ANTHROPIC_API_KEY vacía: fuerza el uso de la suscripción y no de facturación por API (S2).
    env: { ...process.env, ANTHROPIC_API_KEY: '', NO_COLOR: '1' },
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  child.stdin.on('error', () => {}); // el agente puede cerrar antes de leer todo
  child.stdin.end(opts.message);

  let rest = '';
  let text = '';
  let sessionId: string | null = null;
  let cost = 0;
  let error = '';
  let stderr = '';

  const handleLine = (line: string) => {
    const parsed = parseStreamLine(line);
    if (!parsed) return;
    if (parsed.sessionId) sessionId = parsed.sessionId;
    if (parsed.cost !== undefined) cost = parsed.cost;
    if (parsed.error) error = parsed.error;
    for (const event of parsed.events) {
      if (event.type === 'text') text += (text ? '\n\n' : '') + event.text;
      opts.onEvent?.(event);
    }
  };

  child.stdout.on('data', (chunk: Buffer) => {
    rest += chunk.toString('utf8');
    const lines = rest.split(/\r?\n/);
    rest = lines.pop() ?? '';
    lines.forEach(handleLine);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  let code: number | null;
  try {
    code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
  } catch (err) {
    if (opts.signal?.aborted || (err as Error).name === 'AbortError') throw new AgentError('Verificación cancelada.', 'aborted');
    throw new AgentError(`No se pudo lanzar Claude Code: ${(err as Error).message}`, 'agent_failed');
  }
  if (rest) handleLine(rest);

  if (opts.signal?.aborted) throw new AgentError('Verificación cancelada.', 'aborted');
  if (error || code !== 0) {
    const hint = /login|auth|credential/i.test(`${stderr} ${error}`) ? ' Abre una terminal y ejecuta «claude» para iniciar sesión.' : '';
    const detail = error || stderr.trim().split('\n').slice(-3).join(' ') || `claude salió con código ${code}`;
    throw new AgentError(`${detail}${hint}`, 'agent_failed');
  }
  return { text, cost, sessionId };
}
