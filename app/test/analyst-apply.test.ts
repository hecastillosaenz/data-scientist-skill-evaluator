import { describe, expect, it } from 'vitest';
import { AnalysisInvalidError, ANALYST_RULES, applyAnalysis, markOmitted, normalize, shouldAnalyze } from '../server/analyst/apply';
import { findCycle, validateGraph, type GraphFile } from '../server/persistence/graph-store';
import type { Concept, DomainId } from '../shared/types';

const NOW = '2026-10-14T20:00:00.000Z';
const c = (id: string, prerequisites: string[] = [], domain: DomainId = 'sql'): Concept => ({ id, name: id.split(':')[1]!.toUpperCase(), domain, prerequisites });
const graph = (): GraphFile => ({
  version: 1,
  concepts: [c('sql:select'), c('sql:where', ['sql:select']), c('sql:join', ['sql:where']), c('sql:cte', ['sql:join']), c('business:kpi', [], 'business')],
});
const run = (g: GraphFile, evidenceId: string, proposal: unknown) => applyAnalysis(g, { evidence: { id: evidenceId }, proposal, now: NOW });

describe('qué se analiza (R12, AC-R12a)', () => {
  it('solo una Evidence con notas o con bloqueo se analiza', () => {
    expect(shouldAnalyze({})).toBe(false);
    expect(shouldAnalyze({ notes: '   ' })).toBe(false);
    expect(shouldAnalyze({ notes: 'Me confundí con el LEFT JOIN' })).toBe(true);
    expect(shouldAnalyze({ blocker: 'concepto' })).toBe(true);
  });

  it('una Evidence sin nada se registra como omitida, sin concepto ni diagnóstico, y es idempotente', () => {
    const once = markOmitted(graph(), 'ev-1', NOW);
    expect(once.observations).toEqual([{ evidenceId: 'ev-1', at: NOW, status: 'omitida', conceptIds: [], diagnosis: '' }]);
    expect(markOmitted(once, 'ev-1', '2030-01-01T00:00:00.000Z')).toBe(once);
  });
});

describe('observar (R41a, AC-R12b)', () => {
  it('guarda una observación vinculada a conceptos existentes', () => {
    const r = run(graph(), 'ev-1', { conceptIds: ['sql:join'], diagnosis: 'Confunde el grano de las tablas al unir.' });
    expect(r.duplicate).toBe(false);
    expect(r.observation).toEqual({ evidenceId: 'ev-1', at: NOW, status: 'ok', conceptIds: ['sql:join'], diagnosis: 'Confunde el grano de las tablas al unir.' });
    expect(r.graph.observations).toHaveLength(1);
    expect(r.graph.concepts).toEqual(graph().concepts); // observar no cambia la estructura
  });

  it('AC-R41c: un concepto inexistente se descarta y el resto se aplica', () => {
    const r = run(graph(), 'ev-1', { conceptIds: ['sql:join', 'sql:inventado'], diagnosis: 'x' });
    expect(r.observation.conceptIds).toEqual(['sql:join']);
    expect(r.discarded).toEqual([{ kind: 'concepto', reason: 'El concepto «sql:inventado» no existe en el catálogo.' }]);
  });

  it('sin conceptos vinculables el estado es sin_hallazgos', () => {
    expect(run(graph(), 'ev-1', { conceptIds: [], diagnosis: 'Nada claro.' }).observation.status).toBe('sin_hallazgos');
  });

  it('AC-R41d: una sola observación por Evidence; repetir no cambia nada', () => {
    const first = run(graph(), 'ev-1', { conceptIds: ['sql:join'], diagnosis: 'a' });
    const again = run(first.graph, 'ev-1', { conceptIds: ['sql:where'], diagnosis: 'b' });
    expect(again.duplicate).toBe(true);
    expect(again.graph).toBe(first.graph);
    expect(again.graph.observations).toHaveLength(1);
  });

  it('acota el diagnóstico a 300 caracteres', () => {
    const r = run(graph(), 'ev-1', { conceptIds: ['sql:join'], diagnosis: 'x'.repeat(500) });
    expect(r.observation.diagnosis.length).toBe(ANALYST_RULES.maxDiagnosis);
    expect(r.observation.diagnosis.endsWith('…')).toBe(true);
  });

  it('una propuesta que no es un objeto invalida el análisis completo', () => {
    expect(() => run(graph(), 'ev-1', 'texto suelto')).toThrow(AnalysisInvalidError);
    expect(() => run(graph(), 'ev-1', [1, 2])).toThrow(AnalysisInvalidError);
  });
});

describe('enlazar prerrequisitos (R41b)', () => {
  const link = (concept: string, prerequisite: string, why = 'La nota lo muestra.') => ({ concept, prerequisite, why });

  it('añade un prerrequisito válido', () => {
    const r = run(graph(), 'ev-1', { conceptIds: ['sql:cte'], diagnosis: 'x', addPrerequisites: [link('sql:cte', 'business:kpi')] });
    expect(r.applied.links).toEqual([{ concept: 'sql:cte', prerequisite: 'business:kpi', why: 'La nota lo muestra.' }]);
    expect(r.graph.concepts.find((x) => x.id === 'sql:cte')!.prerequisites).toEqual(['sql:join', 'business:kpi']);
    expect(findCycle(r.graph.concepts)).toBeNull();
  });

  it('AC-R41a: un enlace que crea un ciclo se descarta y el resto se aplica', () => {
    // select ← where ← join ← cte: hacer que «select» exija «cte» cerraría un ciclo.
    const r = run(graph(), 'ev-1', {
      conceptIds: ['sql:select', 'sql:where'],
      diagnosis: 'x',
      addPrerequisites: [link('sql:select', 'sql:cte'), link('sql:where', 'business:kpi')],
    });
    expect(r.discarded).toEqual([{ kind: 'enlace', reason: '«sql:select» necesita «sql:cte»: crearía un ciclo de prerrequisitos.' }]);
    expect(r.applied.links.map((l) => l.concept)).toEqual(['sql:where']);
    expect(findCycle(r.graph.concepts)).toBeNull();
  });

  it('descarta enlaces inexistentes, repetidos, a sí mismo, sin motivo o sobre un concepto ajeno a la observación', () => {
    const r = run(graph(), 'ev-1', {
      conceptIds: ['sql:join'],
      diagnosis: 'x',
      addPrerequisites: [
        link('sql:join', 'sql:fantasma'),
        link('sql:join', 'sql:where'), // ya es prerrequisito
        link('sql:join', 'sql:join'),
        link('sql:join', 'business:kpi', ''),
        link('sql:cte', 'business:kpi'), // «cte» no está en conceptIds
      ],
    });
    expect(r.applied.links).toEqual([]);
    expect(r.discarded.map((d) => d.reason)).toEqual([
      expect.stringContaining('«sql:fantasma» no existe'),
      expect.stringContaining('ya es un prerrequisito'),
      expect.stringContaining('de sí mismo'),
      expect.stringContaining('falta el motivo'),
      expect.stringContaining('no figura en los `conceptIds`'),
    ]);
  });

  it('máximo 2 enlaces por análisis', () => {
    const g = graph();
    g.concepts.push(c('sql:a'), c('sql:b'), c('sql:d'));
    const r = run(g, 'ev-1', { conceptIds: ['sql:cte'], diagnosis: 'x', addPrerequisites: [link('sql:cte', 'sql:a'), link('sql:cte', 'sql:b'), link('sql:cte', 'sql:d')] });
    expect(r.applied.links).toHaveLength(2);
    expect(r.discarded[0]!.reason).toContain('como máximo 2');
  });
});

describe('crear conceptos con recurrencia (R41c, AC-R41b)', () => {
  const uncovered = (label = 'Fan-out en JOIN uno a muchos') => ({ uncovered: [{ label, domain: 'sql' }] });
  const create = (over: Record<string, unknown> = {}) => ({
    createConcepts: [{ name: 'Fan-out en JOIN', domain: 'sql', prerequisites: ['sql:join'], candidateLabel: 'Fan-out en JOIN uno a muchos', ...over }],
  });

  it('la primera mención solo guarda un candidato y no crea el concepto', () => {
    const r = run(graph(), 'ev-1', { conceptIds: ['sql:join'], diagnosis: 'x', ...uncovered(), ...create() });
    expect(r.applied.created).toEqual([]);
    expect(r.graph.concepts).toHaveLength(graph().concepts.length);
    expect(r.graph.candidates).toEqual([{ label: 'Fan-out en JOIN uno a muchos', domain: 'sql', evidenceIds: ['ev-1'] }]);
    expect(r.discarded[0]!.reason).toContain('2 Evidence distintas (tiene 1)');
  });

  it('la segunda Evidence distinta crea el concepto, lo marca como del Analista y retira el candidato', () => {
    const first = run(graph(), 'ev-1', { conceptIds: ['sql:join'], diagnosis: 'x', ...uncovered() });
    const second = run(first.graph, 'ev-2', { conceptIds: ['sql:join'], diagnosis: 'y', ...uncovered('fan out en join uno a muchos'), ...create() });
    expect(second.applied.created).toHaveLength(1);
    const made = second.graph.concepts.find((x) => x.id === 'sql:fan-out-en-join')!;
    expect(made).toEqual({ id: 'sql:fan-out-en-join', name: 'Fan-out en JOIN', domain: 'sql', prerequisites: ['sql:join'], origin: 'analista', since: NOW });
    expect(second.graph.candidates).toEqual([]);
    expect(second.observation.conceptIds).toEqual(['sql:join', 'sql:fan-out-en-join']);
    expect(validateGraph(second.graph).ok).toBe(true);
  });

  it('la misma Evidence mencionada dos veces no cuenta como recurrencia', () => {
    const first = run(graph(), 'ev-1', { conceptIds: [], diagnosis: 'x', uncovered: [{ label: 'Tema X', domain: 'sql' }, { label: 'tema x', domain: 'sql' }] });
    expect(first.graph.candidates).toEqual([{ label: 'Tema X', domain: 'sql', evidenceIds: ['ev-1'] }]);
  });

  it('descarta crear con id o nombre repetidos, prerrequisitos inexistentes, dominio inválido o más de uno', () => {
    const base = run(run(graph(), 'ev-1', { conceptIds: [], diagnosis: '', ...uncovered() }).graph, 'ev-2', { conceptIds: [], diagnosis: '', ...uncovered() });
    const g = base.graph;
    const reasons = (over: Record<string, unknown>) => run(g, 'ev-3', { conceptIds: [], diagnosis: '', ...create(over) }).discarded.map((d) => d.reason).join(' | ');
    expect(reasons({ name: 'SELECT', candidateLabel: 'Fan-out en JOIN uno a muchos' })).toContain('Ya existe');
    expect(reasons({ prerequisites: ['sql:fantasma'] })).toContain('«sql:fantasma»');
    expect(reasons({ domain: 'cocina' })).toContain('domain');

    const two = run(g, 'ev-3', {
      conceptIds: [],
      diagnosis: '',
      createConcepts: [
        { name: 'Fan-out en JOIN', domain: 'sql', prerequisites: [], candidateLabel: 'Fan-out en JOIN uno a muchos' },
        { name: 'Otro', domain: 'sql', prerequisites: [], candidateLabel: 'Otro' },
      ],
    });
    expect(two.applied.created).toHaveLength(1);
    expect(two.discarded.some((d) => d.reason.includes('como máximo 1'))).toBe(true);
  });

  it('un tema que ya está en el catálogo no se propone como nuevo', () => {
    const r = run(graph(), 'ev-1', { conceptIds: ['sql:join'], diagnosis: 'x', uncovered: [{ label: 'JOIN', domain: 'sql' }] });
    expect(r.graph.candidates).toEqual([]);
    expect(r.discarded[0]!.reason).toContain('ya existe en el catálogo');
  });

  it('un tema sin dominio válido se descarta', () => {
    const r = run(graph(), 'ev-1', { conceptIds: [], diagnosis: 'x', uncovered: [{ label: 'Algo', domain: 'cocina' }] });
    expect(r.graph.candidates).toEqual([]);
    expect(r.discarded[0]!.kind).toBe('tema');
  });
});

describe('validación del grafo', () => {
  it('detecta ciclos de prerrequisitos y nombra el recorrido', () => {
    const g = graph();
    g.concepts.find((x) => x.id === 'sql:select')!.prerequisites = ['sql:cte'];
    expect(findCycle(g.concepts)).toEqual(['sql:select', 'sql:cte', 'sql:join', 'sql:where', 'sql:select']);
    const result = validateGraph(g);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('ciclo');
  });

  it('exige una sola observación por Evidence y conceptos existentes en ellas', () => {
    const g = graph();
    g.observations = [
      { evidenceId: 'e', at: NOW, status: 'ok', conceptIds: ['sql:select'], diagnosis: 'a' },
      { evidenceId: 'e', at: NOW, status: 'ok', conceptIds: ['sql:fantasma'], diagnosis: 'b' },
    ];
    const result = validateGraph(g);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('más de una observación');
      expect(result.errors.join(' ')).toContain('conceptos existentes');
    }
  });

  it('normalize ignora tildes, mayúsculas y signos', () => {
    expect(normalize('  Fan-out en JOIN: ¡uno-a-muchos!  ')).toBe('fan out en join uno a muchos');
  });
});
