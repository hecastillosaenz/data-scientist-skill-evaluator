import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentError, FORBIDDEN_TOOLS, READ_ONLY_TOOLS, buildArgs, hasClaude, parseStreamLine, runAgent, type AgentEvent } from '../server/agents/agent-runner';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'fake-claude-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Crea un `claude` falso (script Node) que imprime líneas stream-json y registra cómo lo invocaron. */
function fake(name: string, body: string): string {
  const file = join(dir, name);
  writeFileSync(file, `#!/usr/bin/env node\nif (process.argv.includes('--version')) { console.log('fake-claude 1.0'); process.exit(0); }\n${body}`);
  chmodSync(file, 0o755);
  return file;
}

const line = (o: object) => `console.log(${JSON.stringify(JSON.stringify(o))});`;

describe('buildArgs (R9, S4, R14)', () => {
  const args = buildArgs({ system: 'Eres un evaluador', addDirs: ['/tmp/challenge-001'], maxUsd: 0.2 });
  const after = (flag: string, until: string) => {
    const start = args.indexOf(flag) + 1;
    const rest = args.slice(start);
    const end = rest.findIndex((a) => a.startsWith('--') && a !== flag);
    return rest.slice(0, end === -1 ? undefined : end);
  };

  it('ningún rol tiene Bash: figura en --disallowedTools y no en --allowedTools (AC-R9)', () => {
    expect(after('--allowedTools', '--disallowedTools')).toEqual([...READ_ONLY_TOOLS]);
    expect(after('--disallowedTools', '--settings')).toContain('Bash');
    expect(after('--allowedTools', '--disallowedTools')).not.toContain('Bash');
    for (const t of FORBIDDEN_TOOLS) expect(after('--disallowedTools', '--settings')).toContain(t);
  });

  it('declara el modo no interactivo, la salida stream-json y el tope de gasto', () => {
    expect(args).toEqual(expect.arrayContaining(['-p', '--verbose', '--permission-mode', 'dontAsk']));
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(args[args.indexOf('--max-budget-usd') + 1]).toBe('0.2');
  });

  it('no persiste la sesión, para que cada evaluación sea independiente (R14)', () => {
    expect(args).toContain('--no-session-persistence');
    expect(args).not.toContain('--resume');
  });

  it('bloquea la lectura de .env, .git y node_modules', () => {
    const settings = JSON.parse(args[args.indexOf('--settings') + 1]!);
    expect(settings.permissions.deny).toEqual(expect.arrayContaining(['Read(**/.env)', 'Read(**/.git/**)', 'Read(**/node_modules/**)']));
  });

  it('acota el acceso con --add-dir y pasa el prompt del sistema', () => {
    expect(args[args.indexOf('--add-dir') + 1]).toBe('/tmp/challenge-001');
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('Eres un evaluador');
  });
});

describe('parseStreamLine', () => {
  it('extrae texto, herramientas y el resultado', () => {
    const text = parseStreamLine(JSON.stringify({ type: 'assistant', session_id: 's1', message: { content: [{ type: 'text', text: 'Hola' }, { type: 'tool_use', name: 'Read', input: { file_path: 'a.md' } }] } }));
    expect(text).toMatchObject({ sessionId: 's1', events: [{ type: 'text', text: 'Hola' }, { type: 'tool', text: 'Read a.md' }] });
    expect(parseStreamLine(JSON.stringify({ type: 'result', total_cost_usd: 0.03, is_error: false }))).toMatchObject({ cost: 0.03 });
    expect(parseStreamLine(JSON.stringify({ type: 'result', is_error: true, result: 'boom' }))?.error).toBe('boom');
  });
  it('ignora líneas que no son JSON', () => {
    expect(parseStreamLine('basura')).toBeNull();
  });
});

describe('runAgent con un claude falso', () => {
  it('lee el mensaje por stdin, emite eventos y devuelve texto y costo', async () => {
    const bin = fake('ok.js', `
let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' }));
  ${line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'notebook.ipynb' } }] } })}
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Recibí: ' + input.trim() }] } }));
  ${line({ type: 'result', is_error: false, total_cost_usd: 0.02 })}
});`);
    const events: AgentEvent[] = [];
    const result = await runAgent({ message: 'hola agente', bin, onEvent: (e) => events.push(e) });
    expect(result.text).toBe('Recibí: hola agente');
    expect(result.cost).toBe(0.02);
    expect(result.sessionId).toBe('sess-1');
    expect(events).toEqual([{ type: 'tool', text: 'Read notebook.ipynb' }, { type: 'text', text: 'Recibí: hola agente' }]);
  });

  it('no envía ANTHROPIC_API_KEY al proceso hijo (S2)', async () => {
    const bin = fake('env.js', `
process.stdin.resume(); process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'KEY=[' + (process.env.ANTHROPIC_API_KEY ?? 'undefined') + ']' }] } }));
  ${line({ type: 'result', is_error: false, total_cost_usd: 0 })}
});`);
    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-no-debe-llegar';
    try {
      expect((await runAgent({ message: 'x', bin })).text).toBe('KEY=[]');
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it('usa un cwd neutro, fuera del repositorio (S3)', async () => {
    const bin = fake('cwd.js', `
process.stdin.resume(); process.stdin.on('end', () => {
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: process.cwd() }] } }));
  ${line({ type: 'result', is_error: false, total_cost_usd: 0 })}
});`);
    const { text } = await runAgent({ message: 'x', bin });
    expect(text).toContain('dsc-agent');
    expect(text).not.toContain('data-scientist-skill-evaluator');
  });

  it('propaga el error del resultado', async () => {
    const bin = fake('err.js', `process.stdin.resume(); process.stdin.on('end', () => { ${line({ type: 'result', is_error: true, result: 'límite de uso alcanzado' })} });`);
    await expect(runAgent({ message: 'x', bin })).rejects.toMatchObject({ code: 'agent_failed', message: expect.stringContaining('límite de uso') });
  });

  it('sugiere iniciar sesión cuando el fallo es de credenciales', async () => {
    const bin = fake('login.js', `process.stdin.resume(); process.stdin.on('end', () => { console.error('Not logged in: credential missing'); process.exit(1); });`);
    await expect(runAgent({ message: 'x', bin })).rejects.toThrow(/ejecuta «claude»/);
  });

  it('se cancela con AbortSignal y mata el proceso', async () => {
    const bin = fake('slow.js', `process.stdin.resume(); setTimeout(() => {}, 30000);`);
    const ac = new AbortController();
    const run = runAgent({ message: 'x', bin, signal: ac.signal });
    setTimeout(() => ac.abort(), 150);
    await expect(run).rejects.toMatchObject({ code: 'aborted' });
  });

  it('explica con claridad cuando Claude Code no está instalado', async () => {
    expect(hasClaude('/no/existe/claude')).toBe(false);
    await expect(runAgent({ message: 'x', bin: '/no/existe/claude' })).rejects.toBeInstanceOf(AgentError);
    await expect(runAgent({ message: 'x', bin: '/no/existe/claude' })).rejects.toMatchObject({ code: 'no_claude' });
  });
});
