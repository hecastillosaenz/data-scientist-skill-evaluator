import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listChallenges, prepareDataset } from '../server/challenges/challenge-fs';
import { verifyStage } from '../server/verify/verify-service';
import type { VerifyEvent } from '../shared/verify';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const python = path.join(repoRoot, '.venv', 'bin', 'python');
const hasDuckdb = existsSync(python) && spawnSync(python, ['-c', 'import duckdb']).status === 0;

const SOLUTION = `# Entregable - Etapa 1:
resultado = con.sql("""
WITH siniestros_por_poliza AS (
    SELECT poliza_id, SUM(monto_pagado) AS total_pagado FROM siniestros GROUP BY poliza_id
)
SELECT p.tipo,
       COUNT(*) AS n_polizas,
       ROUND(SUM(p.prima_anual), 2) AS primas_totales,
       ROUND(SUM(COALESCE(s.total_pagado, 0)), 2) AS siniestros_totales,
       ROUND(100.0 * SUM(COALESCE(s.total_pagado, 0)) / SUM(p.prima_anual), 2) AS ratio_siniestralidad_pct
FROM polizas p LEFT JOIN siniestros_por_poliza s ON s.poliza_id = p.id
GROUP BY p.tipo
ORDER BY ratio_siniestralidad_pct DESC
""")`;

const WRONG_JOIN = SOLUTION.replace('LEFT JOIN siniestros_por_poliza', 'JOIN siniestros_por_poliza');

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'dsc-real-'));
  cpSync(path.join(repoRoot, 'challenge-001'), path.join(tmp, 'challenge-001'), { recursive: true });
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const withNotebook = (stage1Code: string) => {
  const file = path.join(tmp, 'challenge-001', 'notebook.ipynb');
  const nb = JSON.parse(readFileSync(path.join(repoRoot, 'challenge-001', 'notebook.ipynb'), 'utf8'));
  const idx = nb.cells.findIndex((c: any) => c.cell_type === 'code' && c.source.join('').startsWith('# Entregable - Etapa 1:'));
  nb.cells[idx].source = stage1Code.split('\n').map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l));
  writeFileSync(file, JSON.stringify(nb));
};

const run = async (): Promise<VerifyEvent[]> => {
  const events: VerifyEvent[] = [];
  for await (const e of verifyStage({
    repoRoot: tmp, challengeId: 'challenge-001', stageNumber: 1, apoyo: 'pistas',
    deps: { python, hasClaude: () => false },
  })) events.push(e);
  return events;
};
const result = (events: VerifyEvent[]) => events.find((e) => e.type === 'result') as Extract<VerifyEvent, { type: 'result' }>;

describe('challenge-001 (reto real)', () => {
  it('es un challenge válido y completo en disco', async () => {
    const [loaded] = await listChallenges(repoRoot);
    expect(loaded!.challenge.id).toBe('challenge-001');
    expect(loaded!.challenge.stages.map((s) => s.id)).toEqual(['challenge-001-s1', 'challenge-001-s2']);
    expect(loaded!.challenge.data?.tables.map((t) => t.name)).toEqual(['polizas', 'siniestros']);
    for (const f of ['challenge.json', 'notebook.ipynb', 'datos/seed.sql', 'logs-avance.md']) expect(existsSync(path.join(repoRoot, 'challenge-001', f))).toBe(true);
  });

  it('los ids de pregunta de negocio y del test son únicos y de este challenge', async () => {
    const c = (await listChallenges(repoRoot))[0]!.challenge;
    const ids = [...c.businessQuestions.map((q) => q.id), ...(c.finalTest ?? []).map((q) => q.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('challenge-001-'))).toBe(true);
  });

  it('la base .duckdb está ignorada por git (R24)', () => {
    expect(readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')).toContain('challenge-*/datos/*.duckdb');
  });
});

describe.skipIf(!hasDuckdb)('challenge-001 con DuckDB real', () => {
  it('construir la base dos veces da el mismo resultado (AC-R24)', async () => {
    const dir = path.join(tmp, 'challenge-001');
    const count = () => spawnSync(python, ['-c', 'import duckdb; c = duckdb.connect("datos/challenge.duckdb", read_only=True); print(c.sql("SELECT (SELECT COUNT(*) FROM polizas), (SELECT COUNT(*) FROM siniestros), (SELECT SUM(prima_anual) FROM polizas)").fetchall())'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    await prepareDataset({ dir, python });
    const first = count();
    await prepareDataset({ dir, python });
    expect(count()).toBe(first);
    expect(first).toContain('(8, 8');
    expect(first).toContain('10100');
  });

  it('el notebook con el esqueleto sin completar NO pasa y lo explica', async () => {
    const original = JSON.parse(readFileSync(path.join(repoRoot, 'challenge-001', 'notebook.ipynb'), 'utf8'));
    const skeleton = original.cells.find((c: any) => c.cell_type === 'code' && c.source.join('').startsWith('# Entregable')).source.join('');
    withNotebook(skeleton);
    const events = await run();
    expect(result(events).status).toBe('fallida');
    expect(result(events).summary).toContain('Tu celda terminó con un error');
    const stderr = events.find((e) => e.type === 'output' && e.stream === 'stderr') as Extract<VerifyEvent, { type: 'output' }>;
    expect(stderr.text).toContain('Celda entregable, línea');
    expect(stderr.text).not.toContain('/var/folders');
  });

  it('la solución correcta aprueba la etapa (AC-R8)', async () => {
    withNotebook(SOLUTION);
    const events = await run();
    expect(result(events)).toMatchObject({ status: 'aprobada' });
    expect(events.find((e) => e.type === 'step' && e.id === 'data' && e.status === 'ok')).toBeDefined();
    expect(events.find((e) => e.type === 'step' && e.id === 'compare' && e.status === 'ok')).toBeDefined();
  });

  it('el error de grano (JOIN en lugar de LEFT JOIN) se detecta: da 81,82 % y 250 %', async () => {
    withNotebook(WRONG_JOIN);
    const events = await run();
    expect(result(events).status).toBe('fallida');
    expect(result(events).summary).toMatch(/Fila \d: esperaba/);
  });

  it('una consulta sin ROUND no pasa: exige el redondeo del enunciado', async () => {
    withNotebook(SOLUTION.replace('ROUND(100.0 * SUM(COALESCE(s.total_pagado, 0)) / SUM(p.prima_anual), 2)', '100.0 * SUM(COALESCE(s.total_pagado, 0)) / SUM(p.prima_anual)'));
    expect(result(await run()).status).toBe('fallida');
  });
});
