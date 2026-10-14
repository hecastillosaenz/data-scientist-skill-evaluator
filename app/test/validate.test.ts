import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanChallenges } from '../server/challenges/challenge-fs';
import { validateChallenge } from '../server/challenges/validate';
import { buildChallenges } from '../web/src/data/sample/challenges';
import { verifyStage } from '../server/verify/verify-service';
import type { VerifyEvent } from '../shared/verify';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const real = JSON.parse(readFileSync(path.join(repoRoot, 'challenge', 'challenge-001', 'challenge.json'), 'utf8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('contrato del challenge (R29)', () => {
  it('challenge-001 cumple el contrato en modo estricto (AC-R29)', () => {
    expect(validateChallenge(real, { strict: true })).toEqual({ ok: true, errors: [] });
  });

  it('todos los challenges de ejemplo cumplen la estructura (AC-R29)', () => {
    for (const c of buildChallenges()) {
      const result = validateChallenge(c);
      expect(result.errors, c.id).toEqual([]);
    }
  });

  it('los retos ricos de ejemplo cumplen también el modo estricto', () => {
    for (const c of buildChallenges().filter((x) => ['c006', 'c010', 'c011'].includes(x.id))) {
      const strict = validateChallenge(c, { strict: true });
      // c006 solo enriquece su etapa 1; las demás etapas son compactas a propósito.
      // c006 solo enriquece su etapa 1: todos sus errores deben ser de las etapas 2–4 (compactas a propósito).
      if (c.id === 'c006') expect(strict.errors.every((e) => /[Ee]tapa [234]\b/.test(e))).toBe(true);
      else expect(strict.errors, c.id).toEqual([]);
    }
  });

  it('exige los objetivos y nombra el campo que falta (AC-R28)', () => {
    const c = clone(real);
    delete c.objectives;
    const r = validateChallenge(c);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('Falta el campo «objectives»');
  });

  it('rechaza objetivos incompletos o vacíos', () => {
    const c = clone(real);
    c.objectives.outcomes = ['uno'];
    expect(validateChallenge(c).errors.join(' ')).toMatch(/objectives\.outcomes necesita al menos 2 elementos/);
    const d = clone(real);
    delete d.objectives.skills;
    expect(validateChallenge(d).errors.join(' ')).toContain('Falta el campo «skills»');
  });

  it('rechaza campos desconocidos para que los agentes no inventen estructura', () => {
    const c = clone(real);
    c.stages[0].extra = 1;
    expect(validateChallenge(c).errors.join(' ')).toContain('Campo no permitido «extra»');
  });

  it('rechaza valores fuera de rango con mensajes legibles', () => {
    const c = clone(real);
    c.difficulty = 5;
    c.stages[0].domain = 'quimica';
    const text = validateChallenge(c).errors.join(' ');
    expect(text).toContain('difficulty debe ser uno de: 1, 2, 3');
    expect(text).toContain('stages[1].domain debe ser uno de');
  });

  it('las preguntas del test dependen de su tipo (opción múltiple, numérica, texto)', () => {
    const c = clone(real);
    c.finalTest[0] = { id: 'x', conceptId: 'sql:cte', bloom: 2, kind: 'opcion_multiple', prompt: 'Pregunta aplicada de ejemplo', explanation: 'Explicación de ejemplo.' };
    expect(validateChallenge(c).errors.join(' ')).toMatch(/options|correctIndex/);
  });

  it('reglas semánticas: etapas, ids, llaves foráneas y filas', () => {
    const a = clone(real);
    a.stages[1].number = 4;
    expect(validateChallenge(a).errors.join(' ')).toContain('sin saltos');
    const b = clone(real);
    b.stages[0].id = 'otro-s1';
    expect(validateChallenge(b).errors.join(' ')).toContain('debe llamarse «challenge-001-s1»');
    const c = clone(real);
    c.data.tables[1].columns[1].fk.table = 'no_existe';
    expect(validateChallenge(c).errors.join(' ')).toContain('referencia a una tabla inexistente');
    const d = clone(real);
    d.data.tables[0].sampleRows[0].push('extra');
    expect(validateChallenge(d).errors.join(' ')).toContain('la fila de muestra 1 tiene 4 valores');
    const e = clone(real);
    e.stages[0].content.expected.rows[0].pop();
    expect(validateChallenge(e).errors.join(' ')).toContain('la fila 1 esperada');
    const f = clone(real);
    f.finalTest[0].conceptId = 'ml:knn';
    expect(validateChallenge(f).errors.join(' ')).toContain('no lo practica ninguna etapa');
    const g = clone(real);
    g.finalTest[1].id = g.finalTest[0].id;
    expect(validateChallenge(g).errors.join(' ')).toContain('ids de las preguntas');
  });

  it('una etapa de código sin expected ni asserts no se puede verificar', () => {
    const c = clone(real);
    delete c.stages[0].content.expected;
    expect(validateChallenge(c, { strict: true }).errors.join(' ')).toContain('necesita `expected`');
    expect(validateChallenge(c).ok).toBe(true); // los ejemplos compactos no se verifican de verdad
  });

  it('el modo estricto exige el contenido completo del Generador', () => {
    const c = clone(real);
    delete c.finalTest;
    c.stages[0].content = { deliverables: ['algo que entregar'], expected: c.stages[0].content.expected };
    const text = validateChallenge(c, { strict: true }).errors.join(' ');
    expect(text).toContain('test final');
    expect(text).toContain('falta contenido de estudio (teoría, ejemplo resuelto, paso a paso, pistas, conceptos para investigar, solución)');
    expect(validateChallenge(c).ok).toBe(true); // el modo laxo solo pide estructura
  });

  it('la investigación debe usar conceptos de la etapa', () => {
    const c = clone(real);
    c.stages[0].content.research[0].conceptId = 'ml:knn';
    expect(validateChallenge(c, { strict: true }).errors.join(' ')).toContain('que no figura en sus `conceptIds`');
  });

  it('el esquema tiene descripciones para guiar a los agentes', () => {
    const schema = JSON.parse(readFileSync(path.join(repoRoot, 'configuracion-retos', 'plantillas', 'challenge.schema.json'), 'utf8'));
    expect(schema.properties.objectives.description).toContain('R28');
    expect(schema.$defs.stage.properties.apoyo.description).toContain('TODAS las capas');
    expect(schema.$defs.stageContent.properties.expected.description).toContain('EJECUTANDO la solución de referencia');
  });
});

describe('carga de challenges con validación', () => {
  const withRepo = async (fn: (root: string) => Promise<void>) => {
    const root = mkdtempSync(path.join(tmpdir(), 'dsc-scan-'));
    try {
      await fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('carga los válidos y explica los inválidos sin mezclarlos', async () => {
    await withRepo(async (root) => {
      mkdirSync(path.join(root, 'challenge', 'challenge-001'), { recursive: true });
      writeFileSync(path.join(root, 'challenge', 'challenge-001', 'challenge.json'), JSON.stringify(real));
      mkdirSync(path.join(root, 'challenge', 'challenge-002'), { recursive: true });
      const broken = clone(real);
      broken.id = 'challenge-002';
      delete broken.objectives;
      writeFileSync(path.join(root, 'challenge', 'challenge-002', 'challenge.json'), JSON.stringify(broken));
      mkdirSync(path.join(root, 'challenge', 'challenge-003'), { recursive: true });
      mkdirSync(path.join(root, 'challenge', 'challenge-004'), { recursive: true });
      writeFileSync(path.join(root, 'challenge', 'challenge-004', 'challenge.json'), '{ no es json');

      const scan = await scanChallenges(root);
      expect(scan.loaded.map((c) => c.challenge.id)).toEqual(['challenge-001']);
      expect(scan.invalid.map((i) => i.folder)).toEqual(['challenge-002', 'challenge-003', 'challenge-004']);
      expect(scan.invalid[0]!.errors[0]).toContain('objectives');
      expect(scan.invalid[1]!.errors[0]).toContain('no tiene challenge.json');
      expect(scan.invalid[2]!.errors[0]).toContain('no es un JSON válido');
    });
  });

  it('el id debe coincidir con el nombre de la carpeta', async () => {
    await withRepo(async (root) => {
      mkdirSync(path.join(root, 'challenge', 'challenge-009'), { recursive: true });
      writeFileSync(path.join(root, 'challenge', 'challenge-009', 'challenge.json'), JSON.stringify(real)); // id: challenge-001
      const scan = await scanChallenges(root);
      expect(scan.loaded).toHaveLength(0);
      expect(scan.invalid[0]!.errors[0]).toContain('debe coincidir con el nombre de la carpeta');
    });
  });

  it('verificar un challenge inválido explica por qué en vez de «no existe»', async () => {
    await withRepo(async (root) => {
      mkdirSync(path.join(root, 'challenge', 'challenge-002'), { recursive: true });
      const broken = clone(real);
      broken.id = 'challenge-002';
      delete broken.objectives;
      writeFileSync(path.join(root, 'challenge', 'challenge-002', 'challenge.json'), JSON.stringify(broken));
      const events: VerifyEvent[] = [];
      for await (const e of verifyStage({ repoRoot: root, challengeId: 'challenge-002', stageNumber: 1, apoyo: 'pistas' })) events.push(e);
      const err = events.find((e) => e.type === 'error') as Extract<VerifyEvent, { type: 'error' }>;
      expect(err.code).toBe('challenge_invalido');
      expect(err.message).toContain('no cumple el formato');
      expect(err.message).toContain('objectives');
    });
  });
});

describe('plantillas guardadas para los agentes (R29)', () => {
  const dir = path.join(repoRoot, 'configuracion-retos', 'plantillas');
  const read = (f: string) => readFileSync(path.join(dir, f), 'utf8');

  it('existen el contrato, el esquema y una plantilla por tipo de reto', () => {
    for (const f of ['README.md', 'challenge.schema.json', 'contrato-generador.md', 'plantilla-sql.md', 'plantilla-python.md', 'plantilla-matematica.md', 'plantilla-ml.md', 'plantilla-business.md']) {
      expect(() => read(f), f).not.toThrow();
    }
  });

  it('el README enumera todos los archivos de la carpeta', () => {
    const readme = read('README.md');
    for (const f of ['challenge.schema.json', 'contrato-generador.md', 'plantilla-sql.md', 'plantilla-python.md', 'plantilla-matematica.md', 'plantilla-ml.md', 'plantilla-business.md']) expect(readme).toContain(f);
  });

  it('el contrato cubre objetivos, capas por Apoyo y la verificación obligatoria', () => {
    const c = read('contrato-generador.md');
    expect(c).toContain('Objetivos del reto');
    expect(c).toMatch(/\*\*Guiado\*\*/);
    expect(c).toContain('solución de referencia');
    expect(c).toContain('challenge.schema.json');
  });

  it('cada campo de contenido del esquema aparece mencionado en alguna plantilla o en el contrato', () => {
    const all = ['contrato-generador.md', 'plantilla-sql.md', 'plantilla-python.md', 'plantilla-matematica.md', 'plantilla-ml.md', 'plantilla-business.md'].map(read).join('\n');
    for (const field of ['theory', 'workedExample', 'steps', 'hints', 'skeleton', 'research', 'deliverables', 'expected', 'asserts', 'solution', 'objectives', 'businessQuestions', 'finalTest', 'reflectionGuide']) {
      expect(all, field).toContain(field);
    }
  });
});
