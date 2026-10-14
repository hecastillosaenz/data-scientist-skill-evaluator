import { DOMAINS } from '../../shared/domains';
import type { TemaPedido } from '../../shared/objetivos';
import type { Apoyo, Bloom, Challenge, Concept, ConceptState, Difficulty, DomainId, EvalMechanism, Evidence, TestResult } from '../../shared/types';
import { computeInsights, type ConceptInsight } from '../../web/src/domain/conceptState';
import { levelByDomain } from '../../web/src/domain/level';
import { buildReviewQueue } from '../../web/src/domain/reviewQueue';
import { recommendApoyo } from '../../web/src/domain/weakness';
import type { CalibrationConfig } from './calibration';

/**
 * Plan de calibración (SDD R38). El orquestador decide QUÉ practicar a partir del grafo y la evidencia; el Generador
 * solo escribe cómo se presenta. Es una función pura: el mismo estado produce siempre el mismo plan.
 */
export type StageRole = 'refuerzo' | 'consolidacion' | 'avance' | 'integracion';

export interface PlannedStage {
  number: number;
  role: StageRole;
  domain: DomainId;
  /** El challenge generado debe incluir estos conceptos en la etapa. */
  conceptIds: string[];
  bloom: Bloom;
  difficulty: Difficulty;
  apoyo: Apoyo;
  mechanism: EvalMechanism;
  /** Por qué se eligió, en español (se muestra y se entrega al Generador). */
  why: string;
}

export interface ChallengePlan {
  /** `arranque` = poca evidencia (R4): dificultad 1 y todo Guiado. */
  mode: 'arranque' | 'calibrado';
  id: string;
  number: number;
  difficulty: Difficulty;
  /** Dominio técnico principal; la etapa de integración es de Business. */
  domain: DomainId;
  stages: PlannedStage[];
  /** Datasets y títulos de los últimos challenges: el nuevo no puede repetir dataset ni sector. */
  avoid: { datasets: string[]; titles: string[] };
  rationale: string[];
  /** Tema que pidió el usuario (R43): ocupa las etapas de avance. */
  tema?: TemaPedido;
  /** Títulos de los focos de aprendizaje que influyeron en el plan (R45). */
  focos: string[];
}

/** Un foco activo reducido a lo que el plan necesita (R45). */
export interface FocoPlan {
  id: string;
  titulo: string;
  conceptIds: string[];
}

/** El tema pedido no se puede aplicar (concepto inexistente). */
export class TemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemaError';
  }
}

export interface PlanInput {
  concepts: Concept[];
  challenges: Challenge[];
  evidence: Evidence[];
  testResults?: TestResult[];
  config: CalibrationConfig;
  now: Date;
  /** Dominio elegido por el usuario; por defecto lo recomienda el grafo. */
  domain?: DomainId;
  /** Tema a pedido (R43): el concepto elegido decide qué se practica; la calibración decide cuánto. */
  tema?: TemaPedido;
  /** Focos de aprendizaje activos y vigentes (R45): desempatan, no sustituyen el refuerzo. */
  focos?: FocoPlan[];
}

const DAY_MS = 86_400_000;
const CODE_DOMAINS: ReadonlySet<DomainId> = new Set(['sql', 'python', 'cleaning', 'ml']);
const TECHNICAL: readonly DomainId[] = DOMAINS.map((d) => d.id).filter((d) => d !== 'business');
const clamp = <T extends number>(n: number, min: number, max: number) => Math.min(max, Math.max(min, n)) as T;

const pad3 = (n: number) => String(n).padStart(3, '0');
const mechanismOf = (domain: DomainId): EvalMechanism => (CODE_DOMAINS.has(domain) ? 'codigo_assert' : 'rubric_claude');

/** Apoyo según el estado del concepto: más ayuda si falló o no se ha visto, ninguna si solo se olvidó (R6). */
function apoyoFor(state: ConceptState | undefined, failures: number, reason: 'fallos' | 'olvido' | null): Apoyo {
  if (state === 'con_fallos') return recommendApoyo(Math.max(1, failures), 'fallos');
  if (reason === 'olvido') return 'autonomo';
  if (state === 'dominado') return 'autonomo';
  if (state === 'visto') return 'pistas';
  return 'guiado';
}

export function planChallenge(input: PlanInput): ChallengePlan {
  const { concepts, challenges, evidence, config, now } = input;
  const insights = computeInsights(concepts, challenges, evidence, input.testResults ?? []);
  const stateOf = (id: string): ConceptState => insights.get(id)?.state ?? 'no_visto';
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const levels = levelByDomain(challenges, evidence);
  const arranque = evidence.length < config.evidenciaSuficiente;

  const dependents = new Map<string, number>();
  for (const c of concepts) for (const p of c.prerequisites) dependents.set(p, (dependents.get(p) ?? 0) + 1);
  const deps = (id: string) => dependents.get(id) ?? 0;
  const byIdOrder = (a: Concept, b: Concept) => a.id.localeCompare(b.id);

  // Tema a pedido (R43) y focos de aprendizaje (R45).
  const tema = input.tema ? byId.get(input.tema.conceptId) : undefined;
  if (input.tema && !tema) throw new TemaError(`El concepto «${input.tema.conceptId}» del tema no existe en el grafo.`);
  const closure = new Set<string>();
  if (tema) {
    const walk = (id: string) => {
      for (const p of byId.get(id)?.prerequisites ?? []) if (!closure.has(p)) {
        closure.add(p);
        walk(p);
      }
    };
    walk(tema.id);
  }
  // Con un tema técnico, el refuerzo y la consolidación se limitan a sus fundamentos (el resto espera su turno).
  const inScope = (id: string) => !tema || tema.domain === 'business' || id === tema.id || closure.has(id);
  const focos = input.focos ?? [];
  const focoOf = (id: string): FocoPlan | undefined => focos.find((f) => f.conceptIds.includes(id));
  const focusRank = (c: Concept) => (focoOf(c.id) ? 0 : 1);
  const influencing = new Set<string>();
  const noteFoco = (c: Concept): string => {
    const f = focoOf(c.id);
    if (!f) return '';
    influencing.add(f.titulo);
    return ` Toca tu foco «${f.titulo}».`;
  };

  // Fallos históricos de cada concepto (todas las etapas que lo practican): decide el Apoyo de un refuerzo.
  const stageById = new Map(challenges.flatMap((c) => c.stages.map((s) => [s.id, s] as const)));
  const failuresOf = (conceptId: string) =>
    evidence.filter((e) => e.result === 'fallida' && stageById.get(e.stageId)?.conceptIds.includes(conceptId)).length;

  const rationale: string[] = [];
  const used = new Set<string>();
  const stages: PlannedStage[] = [];
  const slots = config.etapasPorChallenge;

  // Cobertura por dominio: fracción de conceptos ya vistos. El avance va al dominio con menor cobertura.
  const coverage = (d: DomainId) => {
    const inDomain = concepts.filter((c) => c.domain === d);
    return inDomain.length === 0 ? 1 : inDomain.filter((c) => stateOf(c.id) !== 'no_visto').length / inDomain.length;
  };

  // ── Refuerzo o consolidación ──────────────────────────────────────────────
  const queue = buildReviewQueue(concepts, challenges, evidence, now, input.testResults ?? []).filter((i) => i.reason !== 'olvido' && inScope(i.concept.id));
  let anchor: { concept: Concept; role: 'refuerzo' | 'consolidacion'; why: string; reason: 'fallos' | 'olvido' | null; bloom: Bloom | null } | null = null;

  const preferred = input.domain ? queue.filter((i) => i.concept.domain === input.domain) : [];
  const head = preferred[0] ?? queue[0];
  if (head) {
    // Si un prerrequisito directo falló, ahí está la causa raíz: se refuerza ese (R31).
    const failedPrereq = head.concept.prerequisites
      .map((id) => byId.get(id))
      .filter((c): c is Concept => !!c && stateOf(c.id) === 'con_fallos')
      .sort(byIdOrder)[0];
    const target = failedPrereq ?? head.concept;
    const why = failedPrereq
      ? `«${head.concept.name}» falla y su prerrequisito «${failedPrereq.name}» también (causa raíz probable): se refuerza el prerrequisito.`
      : `«${head.concept.name}» es lo primero de tu cola de Repaso (${head.reason === 'fallos' ? 'fallaste este concepto' : head.reason === 'parcial' ? 'respuesta parcial' : 'resuelto con ayuda'}).`;
    anchor = { concept: target, role: 'refuerzo', why, reason: 'fallos', bloom: failedPrereq ? null : head.source.stage.bloom };
  } else {
    const forgotten = concepts
      .filter((c) => {
        const ins = insights.get(c.id);
        return ins?.state === 'dominado' && ins.lastPracticed !== null && (now.getTime() - Date.parse(ins.lastPracticed)) / DAY_MS > config.diasOlvido;
      })
      .filter((c) => !input.domain || c.domain === input.domain)
      .filter((c) => inScope(c.id))
      .sort((a, b) => focusRank(a) - focusRank(b) || Date.parse(insights.get(a.id)!.lastPracticed!) - Date.parse(insights.get(b.id)!.lastPracticed!) || deps(b.id) - deps(a.id) || byIdOrder(a, b));
    const c = forgotten[0];
    if (c) anchor = { concept: c, role: 'consolidacion', why: `«${c.name}» está dominado pero hace más de ${config.diasOlvido} días que no lo practicas: se consolida.`, reason: 'olvido', bloom: null };
  }

  // Frontera del grafo: conceptos no firmes cuyos prerrequisitos ya están al menos «Vistos» (o van antes en este challenge).
  const frontier = (domain: DomainId | null) =>
    concepts
      .filter((c) => !used.has(c.id) && (domain === null || c.domain === domain))
      .filter((c) => stateOf(c.id) === 'no_visto' || stateOf(c.id) === 'visto')
      // Un prerrequisito planeado en una etapa anterior del mismo challenge cuenta como cubierto: las etapas son secuenciales.
      .filter((c) => c.prerequisites.every((p) => ['visto', 'dominado'].includes(stateOf(p)) || used.has(p)))
      .sort((a, b) => focusRank(a) - focusRank(b) || (stateOf(a.id) === 'no_visto' ? 0 : 1) - (stateOf(b.id) === 'no_visto' ? 0 : 1) || deps(b.id) - deps(a.id) || byIdOrder(a, b));
  const pickAvance = (): Concept | undefined => frontier(technical)[0] ?? frontier(null).filter((c) => c.domain !== 'business')[0];

  // Dominio técnico del challenge: el del ancla; si no hay, el usuario o el menos cubierto.
  const focusDomain = frontier(null).find((c) => c.domain !== 'business' && focoOf(c.id))?.domain;
  const technical = anchor && anchor.concept.domain !== 'business' ? anchor.concept.domain
    : tema && tema.domain !== 'business' ? tema.domain
    : input.domain && input.domain !== 'business' ? input.domain
    : focusDomain ? focusDomain
    : [...TECHNICAL].sort((a, b) => coverage(a) - coverage(b) || TECHNICAL.indexOf(a) - TECHNICAL.indexOf(b))[0]!;

  const difficultyIn = (d: DomainId): Difficulty => (arranque ? 1 : clamp<Difficulty>(levels[d].index + 1, 1, 3));
  const bloomFor = (conceptId: string, keep: Bloom | null, failures: number): Bloom => {
    if (arranque) return 3;
    if (keep !== null && failures >= 2) return keep; // no se sube mientras no se aprueba (R6)
    const max = (insights.get(conceptId) as ConceptInsight | undefined)?.maxBloom ?? null;
    return clamp<Bloom>(max === null ? 3 : max + 1, 1, 6);
  };
  const add = (role: StageRole, concept: Concept, why: string, opts: { reason?: 'fallos' | 'olvido' | null; keepBloom?: Bloom | null } = {}) => {
    used.add(concept.id);
    const failures = failuresOf(concept.id);
    const integration = role === 'integracion';
    const bloom = bloomFor(concept.id, opts.keepBloom ?? null, failures);
    stages.push({
      number: stages.length + 1,
      role,
      domain: concept.domain,
      conceptIds: [concept.id],
      bloom: integration ? clamp<Bloom>(Math.max(4, bloom), 1, 6) : bloom,
      difficulty: difficultyIn(concept.domain),
      apoyo: arranque ? 'guiado' : apoyoFor(stateOf(concept.id), failures, opts.reason ?? null),
      mechanism: mechanismOf(concept.domain),
      why,
    });
  };

  const advanceSlots = Math.max(0, slots - 1 - (anchor ? 1 : 0));
  if (anchor) {
    add(anchor.role, anchor.concept, anchor.why, { reason: anchor.reason, keepBloom: anchor.bloom });
    rationale.push(anchor.why + (anchor.role === 'consolidacion' ? noteFoco(anchor.concept) : ''));
  }
  let temaForIntegration: Concept | undefined;
  if (tema && tema.domain === 'business') {
    // Un tema de negocio ocupa la integración; el avance técnico sigue su curso.
    temaForIntegration = tema;
  }
  const temaSlots: Concept[] = [];
  if (tema && tema.domain !== 'business' && !used.has(tema.id)) {
    // Si sus fundamentos aún no se han visto y hay hueco, uno va antes del tema (las etapas son secuenciales).
    // Se prefiere el prerrequisito directo (lo más cercano al tema); si no hay, el primero de la clausura listo para verse.
    const unseen = (ids: Iterable<string>) =>
      [...ids]
        .map((id) => byId.get(id))
        .filter((c): c is Concept => !!c && !used.has(c.id) && stateOf(c.id) === 'no_visto' && c.domain !== 'business')
        .sort((a, b) => deps(b.id) - deps(a.id) || byIdOrder(a, b));
    const foundation =
      unseen(tema.prerequisites)[0] ??
      unseen(closure).find((c) => c.prerequisites.every((p) => ['visto', 'dominado'].includes(stateOf(p))));
    if (foundation && advanceSlots >= 2) temaSlots.push(foundation);
    temaSlots.push(tema);
  }
  for (const c of temaSlots) {
    const isTema = c.id === tema?.id;
    const why = isTema
      ? `Pediste practicar «${input.tema!.texto}»: se trabaja «${c.name}».${stateOf(c.id) === 'no_visto' ? ' Aún no lo has visto, así que empieza Guiado.' : ''}${noteFoco(c)}`
      : `«${c.name}» es un fundamento de «${tema!.name}» que aún no has visto: va antes.`;
    add('avance', c, why);
    rationale.push(why);
  }
  const unmet = tema && tema.domain !== 'business' ? tema.prerequisites.map((id) => byId.get(id)).filter((c): c is Concept => !!c && stateOf(c.id) === 'no_visto' && !used.has(c.id)) : [];
  if (unmet.length > 0 && !temaSlots.some((c) => c.id !== tema?.id)) {
    rationale.push(`Aviso: «${tema!.name}» se apoya en ${unmet.map((c) => `«${c.name}»`).join(', ')}, que aún no has visto; el reto empieza en Apoyo Guiado.`);
  }
  for (let i = temaSlots.length; i < advanceSlots; i++) {
    const c = pickAvance();
    if (!c) break;
    const why = `«${c.name}» está en la frontera de tu grafo (${stateOf(c.id) === 'no_visto' ? 'aún no visto' : 'visto, sin dominar'}) y sus prerrequisitos ya están vistos.${noteFoco(c)}`;
    add('avance', c, why);
    rationale.push(why);
  }

  // ── Integración: Business interpretando el resultado ─────────────────────
  const businessPool = concepts.filter((c) => c.domain === 'business' && !used.has(c.id));
  const business =
    temaForIntegration && !used.has(temaForIntegration.id) ? temaForIntegration :
    frontier('business')[0] ??
    [...businessPool].sort((a, b) => deps(b.id) - deps(a.id) || byIdOrder(a, b))[0];
  if (business) {
    const why = business === temaForIntegration
      ? `Pediste practicar «${input.tema!.texto}»: se interpreta con «${business.name}».`
      : `Integración: interpretar el resultado para negocio con «${business.name}».${noteFoco(business)}`;
    add('integracion', business, why);
    rationale.push(why);
  }

  const sorted = [...challenges].sort((a, b) => b.number - a.number);
  const recent = sorted.slice(0, config.ventanaTemas);
  const number = (sorted[0]?.number ?? 0) + 1;
  const difficulty = clamp<Difficulty>(Math.max(1, ...stages.map((s) => s.difficulty)), 1, 3);
  return {
    mode: arranque ? 'arranque' : 'calibrado',
    id: `challenge-${pad3(number)}`,
    number,
    difficulty,
    domain: technical,
    stages,
    avoid: { datasets: recent.map((c) => c.dataset), titles: recent.map((c) => c.title) },
    ...(input.tema ? { tema: input.tema } : {}),
    focos: [...influencing],
    rationale: [
      arranque
        ? `Modo arranque: tienes ${evidence.length} de ${config.evidenciaSuficiente} registros necesarios; dificultad básica y todo en Apoyo Guiado.`
        : `Plan calibrado con ${evidence.length} registros: dificultad según tu nivel por dominio.`,
      ...rationale,
    ],
  };
}

/**
 * El plan es un contrato (R38): el orquestador rechaza un challenge cuyas etapas no lo siguen. Devuelve los errores
 * en español, cada uno con la etapa y el campo incumplido; vacío si cumple.
 */
export function checkAgainstPlan(challenge: Pick<Challenge, 'id' | 'number' | 'difficulty' | 'stages'>, plan: ChallengePlan): string[] {
  const errors: string[] = [];
  if (challenge.id !== plan.id) errors.push(`«id» debe ser «${plan.id}» (el plan lo fija), llegó «${challenge.id}».`);
  if (challenge.number !== plan.number) errors.push(`«number» debe ser ${plan.number} (el plan lo fija), llegó ${challenge.number}.`);
  if (challenge.difficulty !== plan.difficulty) errors.push(`«difficulty» debe ser ${plan.difficulty} (el plan lo fija), llegó ${challenge.difficulty}.`);
  if (challenge.stages.length !== plan.stages.length) errors.push(`«stages» debe tener ${plan.stages.length} etapas (el plan lo fija), llegaron ${challenge.stages.length}.`);
  for (const planned of plan.stages) {
    const stage = challenge.stages.find((s) => s.number === planned.number);
    if (!stage) {
      errors.push(`Etapa ${planned.number}: falta (el plan la fija como ${planned.role}).`);
      continue;
    }
    const at = `Etapa ${planned.number}`;
    if (stage.domain !== planned.domain) errors.push(`${at}: «domain» debe ser ${planned.domain} (el plan lo fija), llegó ${stage.domain}.`);
    const missing = planned.conceptIds.filter((id) => !stage.conceptIds.includes(id));
    if (missing.length > 0) errors.push(`${at}: «conceptIds» debe incluir ${missing.join(', ')} (el plan lo fija).`);
    if (stage.bloom !== planned.bloom) errors.push(`${at}: «bloom» debe ser ${planned.bloom} (el plan lo fija), llegó ${stage.bloom}.`);
    if (stage.difficulty !== planned.difficulty) errors.push(`${at}: «difficulty» debe ser ${planned.difficulty} (el plan lo fija), llegó ${stage.difficulty}.`);
    if (stage.apoyo !== planned.apoyo) errors.push(`${at}: «apoyo» debe ser ${planned.apoyo} (el plan lo fija), llegó ${stage.apoyo}.`);
    if (stage.mechanism !== planned.mechanism) errors.push(`${at}: «mechanism» debe ser ${planned.mechanism} (el plan lo fija), llegó ${stage.mechanism}.`);
  }
  return errors;
}
