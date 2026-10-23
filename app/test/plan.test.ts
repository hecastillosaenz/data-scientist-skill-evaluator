import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { DEFAULT_CALIBRATION, CalibrationError, loadCalibration, parseCalibration } from '../server/generator/calibration';
import { checkAgainstPlan, planChallenge, TemaError, type PlanInput } from '../server/generator/plan';
import { readGraph } from '../server/persistence/graph-store';
import type { Apoyo, Bloom, Challenge, Concept, Difficulty, DomainId, Evidence, Stage } from '../shared/types';

const NOW = new Date('2026-10-14T12:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const concept = (id: string, domain: DomainId, prerequisites: string[] = []): Concept => ({ id, name: id.split(':')[1]!, domain, prerequisites });
const CONCEPTS: Concept[] = [
  concept('sql:select', 'sql'),
  concept('sql:filter', 'sql'),
  concept('sql:where', 'sql', ['sql:select']),
  concept('sql:join', 'sql', ['sql:where']),
  concept('sql:cte', 'sql', ['sql:join']),
  concept('python:vars', 'python'),
  concept('ml:split', 'ml', ['python:vars']),
  concept('business:kpi', 'business'),
  concept('business:story', 'business', ['business:kpi']),
];

let seq = 0;
const stageOf = (challengeId: string, conceptId: string, over: Partial<Stage> = {}): Stage => {
  seq += 1;
  const domain = conceptId.split(':')[0] as DomainId;
  return {
    id: `${challengeId}-s${seq}`, challengeId, number: seq, title: `Etapa ${seq}`, domain, difficulty: 1, bloom: 3, estimatedMinutes: 20,
    mechanism: 'codigo_assert', description: 'x', conceptIds: [conceptId], apoyo: 'guiado', content: {}, ...over,
  };
};
const challengeOf = (number: number, stages: Stage[], over: Partial<Challenge> = {}): Challenge => ({
  id: `challenge-${String(number).padStart(3, '0')}`, number, title: `Reto ${number}`, dataset: `Dataset ${number}`, difficulty: 1, recommended: false,
  objectives: { lookingFor: 'x', outcomes: [], skills: [] }, scenario: 's', task: '', businessQuestions: [], stages, ...over,
});
const ev = (s: Stage, over: Partial<Evidence> = {}): Evidence => ({
  id: `e-${Math.random()}`, challengeId: s.challengeId, stageId: s.id, at: daysAgo(1), result: 'aprobada', withHelp: false, apoyo: 'autonomo' as Apoyo, actualMinutes: 20, ...over,
});
const input = (over: Partial<PlanInput> = {}): PlanInput => ({ concepts: CONCEPTS, challenges: [], evidence: [], config: DEFAULT_CALIBRATION, now: NOW, ...over });

/** Evidence de relleno para salir del modo arranque sin cambiar el estado de los conceptos relevantes. */
const filler = (count: number): { challenge: Challenge; evidence: Evidence[] } => {
  const s = stageOf('challenge-900', 'ml:split', { difficulty: 1 });
  return { challenge: challengeOf(900, [s], { title: 'Relleno', dataset: 'Relleno' }), evidence: Array.from({ length: count }, () => ev(s, { apoyo: 'pistas' })) };
};

describe('plan de calibración (R38)', () => {
  it('AC-R4/AC-R38b: con menos Evidence que el umbral es de arranque: dificultad 1, todo Guiado, Bloom 3', () => {
    const plan = planChallenge(input());
    expect(plan.mode).toBe('arranque');
    expect(plan.difficulty).toBe(1);
    expect(plan.stages.map((s) => s.apoyo)).toEqual(plan.stages.map(() => 'guiado'));
    expect(plan.stages.every((s) => s.difficulty === 1)).toBe(true);
    expect(plan.rationale[0]).toContain('Modo arranque');
  });

  it('arranque: avance en el dominio menos cubierto (secuencial, sin saltarse prerrequisitos) e integración de Business', () => {
    const plan = planChallenge(input());
    expect(plan.id).toBe('challenge-001');
    expect(plan.domain).toBe('sql');
    const avance = plan.stages.filter((s) => s.role === 'avance');
    expect(avance[0]!.conceptIds).toEqual(['sql:select']); // más dependientes entre las raíces de SQL (select ← where)
    // Las etapas son secuenciales: lo que no tiene prerrequisitos pendientes, o depende de una etapa anterior del mismo challenge.
    const planned = new Set<string>();
    for (const s of avance) {
      const c = CONCEPTS.find((c) => c.id === s.conceptIds[0])!;
      expect(c.prerequisites.every((p) => planned.has(p))).toBe(true);
      planned.add(c.id);
    }
    expect(avance[1]!.conceptIds).toEqual(['sql:where']); // sigue en SQL y depende de «select»
    const last = plan.stages.at(-1)!;
    expect(last.role).toBe('integracion');
    expect(last.domain).toBe('business');
    expect(last.mechanism).toBe('rubric_claude');
    expect(last.bloom).toBeGreaterThanOrEqual(4);
    expect(plan.stages.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it('AC-R2/AC-R38a: un concepto con 2 fallos se refuerza con Apoyo Guiado y su Bloom no sube', () => {
    const f = filler(8);
    const failing = stageOf('challenge-901', 'sql:join', { bloom: 4, difficulty: 2 });
    const ch = challengeOf(901, [failing]);
    const evidence = [...f.evidence, ev(failing, { result: 'fallida', apoyo: 'pistas', at: daysAgo(5) }), ev(failing, { result: 'fallida', apoyo: 'pistas', at: daysAgo(2) })];
    const plan = planChallenge(input({ challenges: [f.challenge, ch], evidence }));
    expect(plan.mode).toBe('calibrado');
    const first = plan.stages[0]!;
    expect(first.role).toBe('refuerzo');
    expect(first.conceptIds).toEqual(['sql:join']);
    expect(first.apoyo).toBe('guiado');
    expect(first.bloom).toBe(4);
    expect(plan.domain).toBe('sql');
  });

  it('un solo fallo recomienda Pistas', () => {
    const f = filler(8);
    const failing = stageOf('challenge-901', 'sql:where');
    const plan = planChallenge(input({ challenges: [f.challenge, challengeOf(901, [failing])], evidence: [...f.evidence, ev(failing, { result: 'fallida' })] }));
    expect(plan.stages[0]).toMatchObject({ role: 'refuerzo', conceptIds: ['sql:where'], apoyo: 'pistas' });
  });

  it('si un prerrequisito directo también falla, el refuerzo va a la causa raíz', () => {
    const f = filler(8);
    const cte = stageOf('challenge-901', 'sql:cte', { bloom: 4 });
    const join = stageOf('challenge-902', 'sql:join');
    const evidence = [
      ...f.evidence,
      ev(cte, { result: 'fallida', at: daysAgo(6) }), ev(cte, { result: 'fallida', at: daysAgo(4) }), ev(cte, { result: 'fallida', at: daysAgo(2) }), // la cola pone primero a «cte»
      ev(join, { result: 'fallida', at: daysAgo(2) }),
    ];
    const plan = planChallenge(input({ challenges: [f.challenge, challengeOf(901, [cte]), challengeOf(902, [join])], evidence }));
    expect(plan.stages[0]!.role).toBe('refuerzo');
    expect(plan.stages[0]!.conceptIds).toEqual(['sql:join']);
    expect(plan.stages[0]!.why).toContain('causa raíz');
  });

  it('sin debilidades y con un concepto dominado olvidado, la primera etapa es de consolidación en Autónomo', () => {
    const f = filler(8);
    const old = stageOf('challenge-901', 'sql:select');
    const plan = planChallenge(input({ challenges: [f.challenge, challengeOf(901, [old])], evidence: [...f.evidence, ev(old, { at: daysAgo(40) })] }));
    expect(plan.stages[0]).toMatchObject({ role: 'consolidacion', conceptIds: ['sql:select'], apoyo: 'autonomo' });
    // Practicado hace 10 días no se considera olvido.
    const recent = planChallenge(input({ challenges: [f.challenge, challengeOf(901, [old])], evidence: [...f.evidence, ev(old, { at: daysAgo(10) })] }));
    expect(recent.stages.some((s) => s.role === 'consolidacion')).toBe(false);
  });

  it('la dificultad es el Nivel del dominio + 1, con tope 3', () => {
    const f = filler(8);
    const a = stageOf('challenge-901', 'sql:select');
    const b = stageOf('challenge-901', 'sql:filter');
    const plan = planChallenge(input({ challenges: [f.challenge, challengeOf(901, [a, b])], evidence: [...f.evidence, ev(a), ev(b)] })); // SQL = Básico
    const sql = plan.stages.filter((s) => s.domain === 'sql');
    expect(sql.length).toBeGreaterThan(0);
    expect(sql.every((s) => s.difficulty === 2)).toBe(true);
    expect(plan.stages.find((s) => s.domain === 'business')!.difficulty).toBe(1); // Business sigue en Trainee
    expect(plan.difficulty).toBe(2);
  });

  it('AC-R38c: el mismo estado produce siempre el mismo plan, sin importar el orden de los datos', () => {
    const f = filler(8);
    const failing = stageOf('challenge-901', 'sql:join', { bloom: 4 });
    const ch = [f.challenge, challengeOf(901, [failing])];
    const evidence = [...f.evidence, ev(failing, { result: 'fallida' })];
    const a = planChallenge(input({ challenges: ch, evidence }));
    const b = planChallenge(input({ challenges: ch, evidence }));
    const c = planChallenge(input({ challenges: [...ch].reverse(), evidence: [...evidence].reverse(), concepts: [...CONCEPTS].reverse() }));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('no repite dataset ni sector de los últimos challenges y numera el siguiente', () => {
    const list = [1, 2, 3, 4, 5].map((n) => challengeOf(n, [stageOf(`challenge-00${n}`, 'ml:split')]));
    const plan = planChallenge(input({ challenges: list }));
    expect(plan.number).toBe(6);
    expect(plan.id).toBe('challenge-006');
    expect(plan.avoid.datasets).toEqual(['Dataset 5', 'Dataset 4', 'Dataset 3']);
    expect(plan.avoid.titles).toEqual(['Reto 5', 'Reto 4', 'Reto 3']);
  });

  it('respeta el dominio pedido por el usuario y el número de etapas configurado', () => {
    const plan = planChallenge(input({ domain: 'ml', config: { ...DEFAULT_CALIBRATION, etapasPorChallenge: 2 } }));
    expect(plan.stages).toHaveLength(2);
    expect(plan.domain).toBe('ml');
    expect(plan.stages[0]!.domain === 'ml' || plan.stages[0]!.domain === 'python').toBe(true);
    expect(plan.stages.at(-1)!.role).toBe('integracion');
  });

  it('con el catálogo real y sin evidencia el plan tiene tres etapas válidas', async () => {
    const graph = await readGraph(path.resolve(import.meta.dirname, '../..'));
    const plan = planChallenge(input({ concepts: graph.concepts }));
    expect(plan.stages).toHaveLength(3);
    const ids = new Set(graph.concepts.map((c) => c.id));
    for (const s of plan.stages) for (const id of s.conceptIds) expect(ids.has(id)).toBe(true);
  });
});

describe('el plan es un contrato (AC-R38d)', () => {
  const plan = planChallenge(input());
  const compliant = (): Pick<Challenge, 'id' | 'number' | 'difficulty' | 'stages'> => ({
    id: plan.id,
    number: plan.number,
    difficulty: plan.difficulty,
    stages: plan.stages.map((p) => stageOf(plan.id, p.conceptIds[0]!, { number: p.number, domain: p.domain, bloom: p.bloom, difficulty: p.difficulty, apoyo: p.apoyo, mechanism: p.mechanism })),
  });

  it('acepta un challenge que sigue el plan', () => {
    expect(checkAgainstPlan(compliant(), plan)).toEqual([]);
  });

  it('rechaza nombrando la etapa y el campo incumplido', () => {
    const c = compliant();
    c.stages[1] = { ...c.stages[1]!, bloom: ((plan.stages[1]!.bloom % 6) + 1) as Bloom, apoyo: 'autonomo' };
    c.stages[0] = { ...c.stages[0]!, conceptIds: ['sql:cte'] };
    c.stages[2] = { ...c.stages[2]!, mechanism: plan.stages[2]!.mechanism === 'codigo_assert' ? 'rubric_claude' : 'codigo_assert' };
    const errors = checkAgainstPlan(c, plan).join('\n');
    expect(errors).toContain('Etapa 1: «conceptIds» debe incluir sql:select');
    expect(errors).toContain('Etapa 2: «bloom»');
    expect(errors).toContain('Etapa 2: «apoyo»');
    expect(errors).toContain('Etapa 3: «mechanism»');
  });

  it('rechaza un id, un número o una cantidad de etapas distintos', () => {
    const c = compliant();
    const errors = checkAgainstPlan({ ...c, id: 'challenge-777', number: 9, difficulty: 3 as Difficulty, stages: c.stages.slice(0, 2) }, plan).join('\n');
    expect(errors).toContain('«id» debe ser «challenge-001»');
    expect(errors).toContain('«number»');
    expect(errors).toContain('«stages» debe tener 3 etapas');
    expect(errors).toContain('Etapa 3: falta');
  });
});

describe('calibracion.json', () => {
  it('completa con los valores por defecto y valida rangos y nombres', () => {
    expect(parseCalibration({})).toEqual(DEFAULT_CALIBRATION);
    expect(parseCalibration({ presupuestoUsdPorFase: 3 }).presupuestoUsdPorFase).toBe(3);
    expect(() => parseCalibration({ etapasPorChallenge: 1 })).toThrow(CalibrationError);
    expect(() => parseCalibration({ presupuestoUsdPorFase: 'mucho' })).toThrow(/presupuestoUsdPorFase/);
    expect(() => parseCalibration({ inventado: 1 })).toThrow(/inventado/);
    expect(() => parseCalibration({ diasOlvido: 2.5 })).toThrow(/entero/);
  });

  it('el archivo del repo es válido y coincide con lo documentado en el SDD', async () => {
    const config = await loadCalibration(path.resolve(import.meta.dirname, '../..'));
    expect(config).toEqual(DEFAULT_CALIBRATION);
    expect(config).toMatchObject({ evidenciaSuficiente: 8, etapasPorChallenge: 3, diasOlvido: 21, ventanaTemas: 3, presupuestoUsdPorFase: 0.75, reparacionesPorFase: 2, horasConservacion: 24, presupuestoUsdAnalisis: 0.3, materialMaxCaracteres: 4000, focosActivosMax: 5, diasRegistroAgentes: 30 });
  });

  it('un archivo ausente usa los valores por defecto', async () => {
    expect(await loadCalibration('/no/existe')).toEqual(DEFAULT_CALIBRATION);
  });
});

describe('tema a pedido y focos de aprendizaje (R43, R45)', () => {
  const DL: Concept[] = [
    concept('math:opt', 'math'),
    concept('math:partial', 'math'),
    concept('ml:gd', 'ml', ['math:partial', 'math:opt']),
    concept('sql:a', 'sql'),
    concept('sql:b', 'sql'),
    concept('python:x', 'python'),
    concept('business:kpi', 'business'),
  ];
  const calibrated = { ...DEFAULT_CALIBRATION, evidenciaSuficiente: 0 };
  const failed = (n: number, conceptId: string, times = 2) => {
    const s = stageOf(`challenge-${n}`, conceptId, { bloom: 3 });
    return { challenge: challengeOf(n, [s], { title: `Falla ${n}`, dataset: `D${n}` }), evidence: Array.from({ length: times }, (_, i) => ev(s, { result: 'fallida', apoyo: 'pistas', at: daysAgo(3 - i) })) };
  };
  const tema = { conceptId: 'ml:gd', texto: 'descenso del gradiente' };

  it('AC-R43a: el tema ocupa las etapas de avance y se anota en el plan y en el razonamiento', () => {
    const plan = planChallenge(input({ concepts: DL, tema }));
    expect(plan.tema).toEqual(tema);
    const avance = plan.stages.filter((s) => s.role === 'avance');
    expect(avance.map((s) => s.conceptIds[0])).toContain('ml:gd');
    expect(plan.domain).toBe('ml');
    expect(plan.rationale.join(' ')).toContain('Pediste practicar «descenso del gradiente»');
    expect(plan.stages.at(-1)!.role).toBe('integracion');
  });

  it('un fundamento sin ver va antes del tema (las etapas son secuenciales) y el tema empieza Guiado', () => {
    const plan = planChallenge(input({ concepts: DL, tema }));
    const order = plan.stages.map((s) => s.conceptIds[0]);
    expect(order.indexOf('math:opt')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('math:opt')).toBeLessThan(order.indexOf('ml:gd'));
    expect(plan.stages.find((s) => s.conceptIds[0] === 'ml:gd')!.apoyo).toBe('guiado');
  });

  it('AC-R43b: un fundamento del tema con fallos entra como refuerzo antes', () => {
    const f = failed(901, 'math:partial');
    const plan = planChallenge(input({ concepts: DL, tema, config: calibrated, challenges: [f.challenge], evidence: f.evidence }));
    expect(plan.stages[0]).toMatchObject({ role: 'refuerzo', conceptIds: ['math:partial'], apoyo: 'guiado' });
    expect(plan.stages[1]!.conceptIds).toEqual(['ml:gd']);
  });

  it('los fallos de conceptos ajenos al tema esperan su turno', () => {
    const f = failed(902, 'sql:a');
    const plan = planChallenge(input({ concepts: DL, tema, config: calibrated, challenges: [f.challenge], evidence: f.evidence }));
    expect(plan.stages.some((s) => s.role === 'refuerzo')).toBe(false);
    expect(plan.stages.map((s) => s.conceptIds[0])).toContain('ml:gd');
  });

  it('la calibración sigue mandando: con poca evidencia el plan sigue en modo arranque con el tema', () => {
    const plan = planChallenge(input({ concepts: DL, tema }));
    expect(plan.mode).toBe('arranque');
    expect(plan.stages.every((s) => s.difficulty === 1 && s.apoyo === 'guiado')).toBe(true);
  });

  it('un tema inexistente se rechaza con un error explícito', () => {
    expect(() => planChallenge(input({ concepts: DL, tema: { conceptId: 'ml:nope', texto: 'x' } }))).toThrow(TemaError);
  });

  it('el plan con tema es determinista', () => {
    expect(planChallenge(input({ concepts: DL, tema }))).toEqual(planChallenge(input({ concepts: [...DL].reverse(), tema })));
  });

  it('AC-R45a: entre dos candidatos de avance equivalentes gana el del foco y se registra', () => {
    const base = planChallenge(input({ concepts: DL, config: calibrated, domain: 'sql' }));
    expect(base.stages.find((s) => s.role === 'avance')!.conceptIds).toEqual(['sql:a']);
    const focused = planChallenge(input({ concepts: DL, config: calibrated, domain: 'sql', focos: [{ id: 'f', titulo: 'Mi certificación', conceptIds: ['sql:b'] }] }));
    expect(focused.stages.find((s) => s.role === 'avance')!.conceptIds).toEqual(['sql:b']);
    expect(focused.focos).toEqual(['Mi certificación']);
    expect(focused.rationale.join(' ')).toContain('Toca tu foco «Mi certificación»');
  });

  it('un foco decide el dominio del avance cuando nada más lo fija', () => {
    expect(planChallenge(input({ concepts: DL, config: calibrated })).domain).toBe('sql');
    const plan = planChallenge(input({ concepts: DL, config: calibrated, focos: [{ id: 'f', titulo: 'Python', conceptIds: ['python:x'] }] }));
    expect(plan.domain).toBe('python');
    expect(plan.stages[0]!.conceptIds).toEqual(['python:x']);
  });

  it('AC-R45b: un concepto con fallos sigue entrando como refuerzo aunque no sea del foco', () => {
    const f = failed(903, 'sql:a');
    const plan = planChallenge(input({ concepts: DL, config: calibrated, challenges: [f.challenge], evidence: f.evidence, focos: [{ id: 'f', titulo: 'Python', conceptIds: ['python:x'] }] }));
    expect(plan.stages[0]).toMatchObject({ role: 'refuerzo', conceptIds: ['sql:a'] });
  });

  it('sin focos el plan no cambia', () => {
    const plain = planChallenge(input({ concepts: DL, config: calibrated }));
    expect(planChallenge(input({ concepts: DL, config: calibrated, focos: [] }))).toEqual(plain);
    expect(plain.focos).toEqual([]);
  });
});
