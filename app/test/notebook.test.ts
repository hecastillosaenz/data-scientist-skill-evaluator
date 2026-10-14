import { describe, expect, it } from 'vitest';
import { NotebookError, dataCells, findDeliverable, markdownAnswer, parseNotebook, type NotebookCell } from '../server/verify/notebook-parser';
import { compareTables } from '../server/verify/compare';
import { buildScript, buildScriptWithMap, mapTraceback, runPython } from '../server/verify/notebook-runner';

const nb = (cells: { type: 'code' | 'markdown'; src: string }[]) =>
  JSON.stringify({ cells: cells.map((c) => ({ cell_type: c.type, source: c.src.split('\n').map((l, i, a) => (i < a.length - 1 ? `${l}\n` : l)), metadata: {} })), metadata: {}, nbformat: 4, nbformat_minor: 5 });

const cells = (...c: [('code' | 'markdown'), string][]): NotebookCell[] => parseNotebook(nb(c.map(([type, src]) => ({ type, src }))));

describe('notebook-parser (R8, R16, R27)', () => {
  it('encuentra la celda entregable de código cuya primera línea es el marcador (AC-R8)', () => {
    const c = cells(['code', 'x = 1'], ['code', '# Entregable - Etapa 1:\nresultado = 2'], ['markdown', 'texto']);
    expect(findDeliverable(c, 1)).toEqual({ kind: 'code', source: '# Entregable - Etapa 1:\nresultado = 2' });
  });

  it('acepta la celda markdown entregable (ruta conceptual)', () => {
    const c = cells(['markdown', '# Entregable - Etapa 2:\nMi recomendación es investigar.']);
    const d = findDeliverable(c, 2);
    expect(d.kind).toBe('markdown');
    expect(markdownAnswer(d.source)).toBe('Mi recomendación es investigar.');
  });

  it('el marcador solo vale si está en la PRIMERA línea', () => {
    const c = cells(['code', 'x = 1\n# Entregable - Etapa 1:\nresultado = 2']);
    expect(() => findDeliverable(c, 1)).toThrow(/No encontré la celda/);
  });

  it('rechaza con error explícito si el número del marcador no coincide (AC-R16)', () => {
    const c = cells(['code', '# Entregable - Etapa 2:\nresultado = 2']);
    try {
      findDeliverable(c, 1);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(NotebookError);
      expect((e as NotebookError).code).toBe('etapa_no_coincide');
      expect((e as NotebookError).message).toContain('no asumo cuál es la correcta');
      expect((e as NotebookError).message).toContain('Etapa 2');
    }
  });

  it('distingue «sin marcadores» de «marcador de otra etapa»', () => {
    expect(() => findDeliverable(cells(['code', 'x = 1']), 1)).toThrowError(expect.objectContaining({ code: 'celda_no_encontrada' }));
  });

  it('rechaza marcadores duplicados', () => {
    const c = cells(['code', '# Entregable - Etapa 1:\na = 1'], ['code', '# Entregable - Etapa 1:\nb = 2']);
    expect(() => findDeliverable(c, 1)).toThrowError(expect.objectContaining({ code: 'marcador_duplicado' }));
  });

  it('tolera espacios y mayúsculas en el marcador', () => {
    expect(findDeliverable(cells(['code', '#  entregable  -  etapa 3 :\nresultado = 1']), 3).kind).toBe('code');
  });

  it('recoge las celdas # Datos en orden y solo de código', () => {
    const c = cells(['code', '# Datos\nimport duckdb'], ['markdown', '# Datos\nno cuenta'], ['code', '# Datos\ncon = 1'], ['code', 'otra']);
    expect(dataCells(c)).toEqual(['# Datos\nimport duckdb', '# Datos\ncon = 1']);
  });

  it('un notebook inválido da un error explícito', () => {
    expect(() => parseNotebook('no es json')).toThrowError(expect.objectContaining({ code: 'notebook_invalido' }));
    expect(() => parseNotebook('{"a":1}')).toThrowError(expect.objectContaining({ code: 'notebook_invalido' }));
  });
});

describe('compareTables', () => {
  const expected = { columns: ['tipo', 'n', 'ratio'], rows: [['hogar', 2, 136.36], ['auto', 3, 60]] as (string | number)[][] };

  it('coincide aunque cambien las mayúsculas de las columnas y los enteros vengan como float', () => {
    expect(compareTables(expected, { columns: ['TIPO', 'N', 'Ratio'], rows: [['hogar', 2.0, 136.36], ['auto', 3, 60.0]] }).match).toBe(true);
  });
  it('informa columnas distintas sin comparar filas', () => {
    const r = compareTables(expected, { columns: ['tipo', 'total'], rows: [] });
    expect(r.match).toBe(false);
    expect(r.problems[0]).toContain('Esperaba las columnas');
  });
  it('informa número de filas y la primera fila distinta', () => {
    const r = compareTables(expected, { columns: ['tipo', 'n', 'ratio'], rows: [['hogar', 2, 136.36], ['auto', 3, 42.86], ['extra', 1, 1]] });
    expect(r.match).toBe(false);
    expect(r.problems.join(' ')).toContain('Esperaba 2 filas y devolviste 3');
    expect(r.problems.join(' ')).toContain("Fila 2: esperaba ('auto', 3, 60) y obtuve ('auto', 3, 42.86)");
  });
  it('el orden de las filas importa', () => {
    expect(compareTables(expected, { columns: ['tipo', 'n', 'ratio'], rows: [['auto', 3, 60], ['hogar', 2, 136.36]] }).match).toBe(false);
  });
  it('trata NULL como NULL', () => {
    const e = { columns: ['a'], rows: [[null]] as (null)[][] };
    expect(compareTables(e, { columns: ['a'], rows: [[null]] }).match).toBe(true);
    expect(compareTables(e, { columns: ['a'], rows: [[0]] }).match).toBe(false);
  });
});

const python = process.env.PYTHON ?? 'python3';

describe('notebook-runner (R27)', () => {
  const cwd = process.cwd();

  it('arma el script: datos, entregable, asserts y captura', () => {
    const s = buildScript({ dataCells: ['# Datos\nd = 1'], deliverable: '# Entregable - Etapa 1:\nresultado = []', asserts: 'assert d == 1', captureResult: true });
    expect(s.indexOf('d = 1')).toBeLessThan(s.indexOf('resultado = []'));
    expect(s.indexOf('resultado = []')).toBeLessThan(s.indexOf('assert d == 1'));
    expect(s).toContain('__DSC_RESULT__');
  });

  it('ejecuta las celdas de datos antes que la entregable y captura el resultado', async () => {
    const r = await runPython({
      python, cwd, captureResult: true,
      dataCells: ['# Datos\nbase = [("a", 1), ("b", 2)]'],
      deliverable: '# Entregable - Etapa 1:\nresultado = [{"k": k, "v": v} for k, v in base]\nprint("hola")',
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('hola');
    expect(r.table).toEqual({ columns: ['k', 'v'], rows: [['a', 1], ['b', 2]] });
  });

  it('un assert que falla deja el código de salida y el traceback', async () => {
    const r = await runPython({ python, cwd, dataCells: [], deliverable: 'x = 2', asserts: 'assert x == 3, "x debía valer 3"' });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('AssertionError: x debía valer 3');
  });

  it('avisa con claridad si falta la variable resultado', async () => {
    const r = await runPython({ python, cwd, dataCells: [], deliverable: 'y = 1', captureResult: true });
    expect(r.harnessError).toContain('no define la variable `resultado`');
  });

  it('termina el proceso al pasar el timeout (AC-R27)', async () => {
    const r = await runPython({ python, cwd, dataCells: [], deliverable: 'import time\ntime.sleep(10)', timeoutMs: 400 });
    expect(r.timedOut).toBe(true);
    expect(r.durationMs).toBeLessThan(3000);
  });

  it('limita la salida', async () => {
    const r = await runPython({ python, cwd, dataCells: [], deliverable: 'print("x" * 500000)', maxOutputBytes: 1000 });
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(200_000);
  });

  it('no pasa ANTHROPIC_API_KEY al código del usuario', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-secreto';
    try {
      const r = await runPython({ python, cwd, dataCells: [], deliverable: 'import os\nprint(os.environ.get("ANTHROPIC_API_KEY", "ausente"))' });
      expect(r.stdout).toBe('ausente');
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});

describe('tracebacks legibles', () => {
  const cwd = process.cwd();

  it('el error de tu celda dice en qué celda y línea falló, sin rutas temporales', async () => {
    const r = await runPython({ python, cwd, dataCells: ['# Datos\nbase = 1'], deliverable: '# Entregable - Etapa 1:\nx = 1\nresultado = x / 0' });
    expect(r.stderr).toContain('Celda entregable, línea 3');
    expect(r.stderr).toContain('ZeroDivisionError');
    expect(r.stderr).not.toContain('main.py');
    expect(r.stderr).not.toContain('/var/folders');
  });

  it('un error en la celda # Datos se atribuye a los datos', async () => {
    const r = await runPython({ python, cwd, dataCells: ['# Datos\nimport modulo_que_no_existe'], deliverable: 'x = 1' });
    expect(r.stderr).toContain('Celda # Datos, línea 2');
  });

  it('un assert fallido se atribuye a los asserts de la etapa', async () => {
    const r = await runPython({ python, cwd, dataCells: [], deliverable: 'x = 2', asserts: 'assert x == 3' });
    expect(r.stderr).toContain('Asserts de la etapa, línea 1');
  });

  it('mapea por rangos y deja intacto lo que no es un traceback', () => {
    const { ranges } = buildScriptWithMap({ dataCells: ['a\nb'], deliverable: 'c\nd\ne' });
    expect(ranges.map((x) => [x.name, x.start, x.lines])).toEqual([['datos', 1, 2], ['entregable', 4, 3]]);
    expect(mapTraceback('File "/tmp/x/main.py", line 5, in <module>', ranges)).toBe('Celda entregable, línea 2');
    expect(mapTraceback('sin traceback', ranges)).toBe('sin traceback');
  });
});
