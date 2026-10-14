import type { Apoyo, AppData, Blocker, Concept, ConceptState, ResearchItem } from '../../../shared/types';
import { APOYO_LABEL, BLOCKER_LABEL, CONCEPT_STATE_LABEL } from '../../../shared/domains';
import { computeInsights, type ConceptInsight } from './conceptState';
import { buildReviewQueue, PRIORITY_LABEL, type ReviewItem } from './reviewQueue';
import { stagesForConcept } from './graphQueries';
import type { StageRef } from './stats';

/** Cada línea de la evidencia de una debilidad: un intento de etapa o una pregunta del test final. */
export interface EvidenceLine {
  id: string;
  /** ISO 8601. */
  at: string;
  source: 'etapa' | 'test';
  /** «Etapa 3 · Evaluar con métricas correctas» o «Test final». */
  label: string;
  /** Contexto: nombre del challenge o el enunciado (recortado) de la pregunta. */
  detail: string;
  result: 'aprobada' | 'parcial' | 'fallida';
  withHelp: boolean;
  blocker?: Blocker;
  notes?: string;
  minutes?: number;
}

/** Lo que el Analista observó sobre este concepto en un registro (R41). */
export interface AnalystNote {
  evidenceId: string;
  /** ISO 8601 del registro analizado. */
  at: string;
  /** «Etapa 3 · Evaluar con métricas correctas». */
  label: string;
  diagnosis: string;
}

export interface RootCause {
  concept: Concept;
  state: ConceptState;
  /** Por qué se considera causa posible. */
  why: string;
  /** Tiene su propio análisis (ya fue practicado). */
  hasAnalysis: boolean;
}

export interface ActionStep {
  id: string;
  kind: 'prerrequisito' | 'teoria' | 'error' | 'investigar' | 'practicar' | 'refuerzo' | 'test';
  title: string;
  detail: string;
  /** Ruta interna a la que lleva el paso. */
  to?: string;
  /** Enlaces externos (búsquedas). */
  links?: { label: string; href: string }[];
}

export interface WeaknessAnalysis {
  concept: Concept;
  insight: ConceptInsight | undefined;
  /** Elemento de la cola de Repaso, si el concepto está en ella. */
  item: ReviewItem | null;
  /** Frase que resume en qué estás fallando. */
  headline: string;
  /** Qué ocurre, en frases concretas basadas en tu evidencia. */
  diagnosis: string[];
  stats: { attempts: number; failures: number; withHelp: number; daysSincePractice: number | null; testFailures: number; testTotal: number };
  evidence: EvidenceLine[];
  blockers: { blocker: Blocker; count: number }[];
  rootCauses: RootCause[];
  /** Observaciones del Analista sobre este concepto, de la más reciente a la más antigua. */
  analystNotes: AnalystNote[];
  /** Registros de este concepto con notas o bloqueo que el Analista aún no ha revisado. */
  pendingAnalysis: number;
  /** Cuántos conceptos dependen de este y se ven frenados por él. */
  dependents: number;
  commonError: { text: string; stageTitle: string; challengeTitle: string } | null;
  research: ResearchItem[];
  steps: ActionStep[];
  /** Apoyo con el que conviene reintentar. */
  recommendedApoyo: Apoyo;
  /** Etapa a la que volver. */
  practice: StageRef | null;
}

const DAY_MS = 86_400_000;
const search = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;
const short = (text: string, max = 110) => {
  const plain = text.replace(/[`*_$\\]|\s+/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const WEAK: ConceptState[] = ['con_fallos', 'no_visto', 'visto'];

/** Qué Apoyo conviene para reintentar: más ayuda si falló repetidamente, ninguna si solo se olvidó. */
export function recommendApoyo(failures: number, reason: ReviewItem['reason'] | null): Apoyo {
  if (failures >= 2) return 'guiado';
  if (failures === 1 || reason === 'parcial' || reason === 'ayuda') return 'pistas';
  return 'autonomo';
}

/**
 * Análisis de una debilidad (SDD R31): en qué se está fallando, con qué evidencia, qué podría estar detrás y cómo
 * mejorar. Es determinista: sale de la evidencia, de las notas del usuario y del grafo, sin llamar a ningún agente.
 */
export function analyzeWeakness(conceptId: string, data: AppData, now: Date): WeaknessAnalysis | null {
  const concept = data.concepts.find((c) => c.id === conceptId);
  if (!concept) return null;

  const insights = computeInsights(data.concepts, data.challenges, data.evidence, data.testResults);
  const insight = insights.get(conceptId);
  const queue = buildReviewQueue(data.concepts, data.challenges, data.evidence, now, data.testResults);
  const item = queue.find((i) => i.concept.id === conceptId) ?? null;

  const refs = stagesForConcept(conceptId, data.challenges);
  const stageIds = new Set(refs.map((r) => r.stage.id));
  const refByStage = new Map(refs.map((r) => [r.stage.id, r]));

  const evidence: EvidenceLine[] = data.evidence
    .filter((e) => stageIds.has(e.stageId))
    .map((e) => {
      const ref = refByStage.get(e.stageId)!;
      return {
        id: e.id,
        at: e.at,
        source: 'etapa' as const,
        label: `Etapa ${ref.stage.number} · ${ref.stage.title}`,
        detail: ref.challenge.title,
        result: e.result,
        withHelp: e.withHelp,
        ...(e.blocker ? { blocker: e.blocker } : {}),
        ...(e.notes ? { notes: e.notes } : {}),
        minutes: e.actualMinutes,
      };
    });

  // Preguntas del test final atadas a este concepto.
  const questions = data.challenges.flatMap((c) => (c.finalTest ?? []).filter((q) => q.conceptId === conceptId).map((q) => ({ challenge: c, q })));
  const questionById = new Map(questions.map((x) => [`${x.challenge.id}:${x.q.id}`, x]));
  let testFailures = 0;
  const latestTest = new Map<string, boolean>();
  for (const r of [...data.testResults].sort((a, b) => a.at.localeCompare(b.at))) {
    const found = questionById.get(`${r.challengeId}:${r.questionId}`);
    if (!found) continue;
    latestTest.set(`${r.challengeId}:${r.questionId}`, r.correct);
    evidence.push({
      id: r.id,
      at: r.at,
      source: 'test',
      label: 'Test final',
      detail: short(found.q.prompt),
      result: r.correct ? 'aprobada' : 'fallida',
      withHelp: false,
    });
  }
  for (const ok of latestTest.values()) if (!ok) testFailures++;
  evidence.sort((a, b) => b.at.localeCompare(a.at));

  // Lo que el Analista observó sobre este concepto (R41). Puede venir de una etapa que no lo practica (la nota lo
  // evidenció), así que se busca por observación y no por las etapas del concepto.
  const observed = new Map((data.observations ?? []).map((o) => [o.evidenceId, o]));
  const allStages = new Map(data.challenges.flatMap((c) => c.stages).map((st) => [st.id, st] as const));
  const analystNotes: AnalystNote[] = data.evidence
    .flatMap((e) => {
      const o = observed.get(e.id);
      if (!o || o.status !== 'ok' || !o.diagnosis || !o.conceptIds.includes(conceptId)) return [];
      const st = allStages.get(e.stageId);
      return [{ evidenceId: e.id, at: e.at, label: st ? `Etapa ${st.number} · ${st.title}` : 'Etapa', diagnosis: o.diagnosis }];
    })
    .sort((a, b) => b.at.localeCompare(a.at));
  const pendingAnalysis = data.observations
    ? data.evidence.filter((e) => stageIds.has(e.stageId) && !observed.has(e.id) && ((e.notes?.trim() ?? '') !== '' || e.blocker !== undefined)).length
    : 0;

  if (evidence.length === 0 && !item && analystNotes.length === 0) return null;

  const stageAttempts = evidence.filter((e) => e.source === 'etapa');
  const failures = stageAttempts.filter((e) => e.result === 'fallida').length;
  const withHelp = stageAttempts.filter((e) => e.withHelp).length;
  const last = evidence[0];
  const daysSincePractice = last ? Math.floor((now.getTime() - new Date(last.at).getTime()) / DAY_MS) : null;

  const blockerCount = new Map<Blocker, number>();
  for (const e of stageAttempts) if (e.blocker) blockerCount.set(e.blocker, (blockerCount.get(e.blocker) ?? 0) + 1);
  const blockers = [...blockerCount.entries()].map(([blocker, count]) => ({ blocker, count })).sort((a, b) => b.count - a.count || a.blocker.localeCompare(b.blocker));

  // Conceptos con algún intento (de etapa o de test): solo esos tienen un análisis al que enlazar.
  const stageById = new Map(data.challenges.flatMap((c) => c.stages).map((st) => [st.id, st]));
  const practiced = new Set<string>([
    ...data.evidence.flatMap((e) => stageById.get(e.stageId)?.conceptIds ?? []),
    ...data.testResults.map((t) => t.conceptId),
  ]);

  // Causas raíz: prerrequisitos directos que no están firmes (con fallos primero).
  const byId = new Map(data.concepts.map((c) => [c.id, c]));
  const rank: Record<ConceptState, number> = { con_fallos: 0, no_visto: 1, visto: 2, dominado: 3 };
  const rootCauses: RootCause[] = concept.prerequisites
    .map((id) => byId.get(id))
    .filter((c): c is Concept => !!c)
    .map((c) => ({ concept: c, state: insights.get(c.id)?.state ?? ('no_visto' as ConceptState) }))
    .filter((r) => WEAK.includes(r.state))
    .sort((a, b) => rank[a.state] - rank[b.state] || a.concept.name.localeCompare(b.concept.name, 'es'))
    .map((r) => ({
      ...r,
      why:
        r.state === 'con_fallos'
          ? `Tienes fallos vigentes en «${r.concept.name}», que este concepto da por sabido.`
          : r.state === 'no_visto'
            ? `Aún no has practicado «${r.concept.name}», un prerrequisito de este concepto.`
            : `Solo has visto «${r.concept.name}» de pasada (con ayuda o respuestas parciales).`,
      hasAnalysis: practiced.has(r.concept.id),
    }));

  const dependents = data.concepts.filter((c) => c.prerequisites.includes(conceptId)).length;

  // Error común: el de la etapa donde más se falla (o la más reciente), tomado de su solución.
  const labelOf = (r: StageRef) => `Etapa ${r.stage.number} · ${r.stage.title}`;
  const worstAttempt = [...stageAttempts].filter((e) => e.result !== 'aprobada').sort((a, b) => b.at.localeCompare(a.at))[0];
  const worstRef = worstAttempt ? refs.find((r) => labelOf(r) === worstAttempt.label) : undefined;
  const errorRef = worstRef ?? refs.find((r) => r.stage.content.solution?.commonError) ?? null;
  const commonError = errorRef?.stage.content.solution?.commonError
    ? { text: errorRef.stage.content.solution.commonError, stageTitle: errorRef.stage.title, challengeTitle: errorRef.challenge.title }
    : null;

  const research: ResearchItem[] = refs.flatMap((r) => (r.stage.content.research ?? []).filter((x) => x.conceptId === conceptId));
  const reason = item?.reason ?? null;
  const recommendedApoyo = recommendApoyo(failures, reason);
  // Etapa a la que volver: la de la cola de Repaso, o donde más reciente fue el problema, o la primera que lo practica.
  const practice = item?.source ?? worstRef ?? refs[0] ?? null;

  // ── Diagnóstico ──
  const diagnosis: string[] = [];
  if (failures > 0) {
    const ref = practice;
    diagnosis.push(
      `Has fallado ${plural(failures, 'intento', 'intentos')} de ${plural(stageAttempts.length, 'intento', 'intentos')} en las etapas que practican este concepto${ref ? `, la última vez en «${ref.stage.title}»` : ''}.`,
    );
  }
  const topBlocker = blockers[0];
  if (topBlocker) {
    diagnosis.push(`Tu bloqueo más repetido es «${BLOCKER_LABEL[topBlocker.blocker]}» (${topBlocker.count} de ${plural(stageAttempts.length, 'intento', 'intentos')}).`);
  }
  const quoted = stageAttempts.find((e) => e.notes);
  if (quoted?.notes) diagnosis.push(`Lo dijiste tú en tus notas: «${quoted.notes}»`);
  if (withHelp > 0) diagnosis.push(`Resolviste con ayuda (abriste la solución) ${plural(withHelp, 'vez', 'veces')}: el concepto aún no sale solo.`);
  if (testFailures > 0) diagnosis.push(`En el test final fallaste ${testFailures} de ${questions.length} ${questions.length === 1 ? 'pregunta' : 'preguntas'} de este concepto: reconocerlo en un caso nuevo todavía no es automático.`);
  if (reason === 'olvido' && daysSincePractice !== null) diagnosis.push(`Lo resolviste bien, pero hace ${daysSincePractice} días que no lo practicas y conviene repasarlo antes de que se olvide.`);
  if (rootCauses.length > 0) diagnosis.push(`Puede que la causa esté antes: ${rootCauses.length === 1 ? 'un prerrequisito no está firme' : `${rootCauses.length} prerrequisitos no están firmes`} (${rootCauses.map((r) => r.concept.name).join(', ')}).`);
  if (stageAttempts.length === 0 && testFailures === 0 && analystNotes.length > 0) diagnosis.push('El Analista observó dificultades con este concepto en tus notas, aunque aún no lo has practicado en una etapa propia. Su diagnóstico está más abajo.');
  if (diagnosis.length === 0) diagnosis.push(item ? 'Este concepto está en tu cola de Repaso, pero aún no hay suficiente evidencia para precisar la causa.' : 'No hay señales de debilidad en este concepto por ahora.');
  if (dependents > 0 && (failures > 0 || testFailures > 0)) diagnosis.push(`Importa más de lo que parece: ${plural(dependents, 'concepto depende', 'conceptos dependen')} de este.`);

  const headline =
    reason === 'fallos'
      ? `Estás fallando en «${concept.name}»`
      : reason === 'parcial'
        ? `Tus respuestas sobre «${concept.name}» salen incompletas`
        : reason === 'ayuda'
          ? `Necesitas ayuda para resolver «${concept.name}»`
          : reason === 'olvido'
            ? `«${concept.name}» se te puede estar olvidando`
            : `Estado de «${concept.name}»: ${CONCEPT_STATE_LABEL[insight?.state ?? 'no_visto'].toLowerCase()}`;

  // ── Plan de mejora ──
  const steps: ActionStep[] = [];
  const firstRoot = rootCauses[0];
  if (firstRoot) {
    steps.push({
      id: 'prereq',
      kind: 'prerrequisito',
      title: `Refuerza primero «${firstRoot.concept.name}»`,
      detail: firstRoot.why,
      to: firstRoot.hasAnalysis ? `/debilidad/${encodeURIComponent(firstRoot.concept.id)}` : `/grafo?concepto=${encodeURIComponent(firstRoot.concept.id)}`,
    });
  }
  const theory = refs.flatMap((r) => r.stage.content.theory ?? []);
  if (theory.length > 0 && (reason !== 'olvido')) {
    steps.push({
      id: 'theory',
      kind: 'teoria',
      title: 'Relee la teoría aplicada de la etapa',
      detail: `Empieza por «${theory[0]!.title}». Leer la teoría no cuenta como ayuda en tu historial.`,
      ...(practice ? { to: `/challenge-actual/${practice.challenge.id}` } : {}),
    });
  }
  if (commonError) {
    steps.push({ id: 'error', kind: 'error', title: 'Compara tu error con el error común', detail: `En «${commonError.stageTitle}» el fallo típico está descrito en la solución; busca si es el tuyo.` });
  }
  const searches = research.length > 0
    ? research.slice(0, 2).flatMap((r) => [{ label: `ES · ${r.searchEs}`, href: search(r.searchEs) }, { label: `EN · ${r.searchEn}`, href: search(r.searchEn) }])
    : [{ label: `ES · ${concept.name}`, href: search(`${concept.name} explicación con ejemplos`) }, { label: `EN · ${concept.name}`, href: search(`${concept.name} tutorial examples`) }];
  steps.push({
    id: 'research',
    kind: 'investigar',
    title: 'Investiga con una frase de control',
    detail: `Hasta poder explicar «${concept.name}» en una sola frase. Ese tiempo no cuenta en el cronómetro.`,
    links: searches,
  });
  if (practice) {
    steps.push({
      id: 'practice',
      kind: 'practicar',
      title: `Reintenta la Etapa ${practice.stage.number} con Apoyo ${APOYO_LABEL[recommendedApoyo]}`,
      detail:
        recommendedApoyo === 'guiado'
          ? 'Has fallado más de una vez: vuelve a Guiado para ver la teoría y el paso a paso, y sube de nivel cuando salga sin ayuda.'
          : recommendedApoyo === 'pistas'
            ? 'Con pistas verás por dónde empezar sin que te den la solución.'
            : 'Ya lo dominaste una vez: reinténtalo en Autónomo para comprobar que sigue firme.',
      to: `/challenge-actual/${practice.challenge.id}`,
    });
  }
  steps.push({
    id: 'reinforcement',
    kind: 'refuerzo',
    title: 'Genera un reto de refuerzo más corto',
    detail: 'Un escalón menos de dificultad y 5 minutos menos, con Apoyo Pistas.',
  });
  if (testFailures > 0) {
    steps.push({ id: 'test', kind: 'test', title: 'Repite el test final', detail: 'Cuando hayas repasado, vuelve a las preguntas que fallaste: cuenta el último resultado de cada una.', ...(practice ? { to: `/challenge-actual/${practice.challenge.id}` } : {}) });
  }

  return { concept, insight, item, headline, diagnosis, stats: { attempts: stageAttempts.length, failures, withHelp, daysSincePractice, testFailures, testTotal: questions.length }, evidence, blockers, rootCauses, analystNotes, pendingAnalysis, dependents, commonError, research, steps, recommendedApoyo, practice };
}

export const priorityText = (item: ReviewItem | null): string => (item ? PRIORITY_LABEL[item.priority] : '—');
