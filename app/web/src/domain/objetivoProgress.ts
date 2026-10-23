import type { Foco, PlanPaso } from '../../../shared/objetivos';
import type { Bloom, Challenge, Concept, ConceptState, Evidence, TestResult } from '../../../shared/types';
import { computeInsights, type ConceptInsight } from './conceptState';

/** Bloom al que se apunta cuando un foco no tiene plan y solo trae conceptos sueltos (R44). */
export const BLOOM_POR_DEFECTO: Bloom = 3;

export interface PasoProgreso {
  paso: PlanPaso;
  concept: Concept | undefined;
  state: ConceptState;
  /** Mayor Bloom aprobado sin ayuda en el concepto (R11), o null. */
  maxBloom: Bloom | null;
  /** 0–1: cuánto del Bloom objetivo ya demostraste. */
  score: number;
  /** Alcanzaste el Bloom objetivo (aprobado sin ayuda). */
  done: boolean;
  lastPracticed: string | null;
}

export interface RetoLink {
  challenge: Challenge;
  /** Qué etapas del reto practican cada concepto del objetivo. */
  cells: { conceptId: string; stageNumbers: number[] }[];
  last: string | null;
}

export interface FocoProgreso {
  pasos: PasoProgreso[];
  /** 0–100: promedio de `score` de los pasos (R56, fórmula provisional). */
  pct: number;
  done: number;
  /** Pasos con al menos una práctica. */
  started: number;
  retos: RetoLink[];
  lastActivity: string | null;
  /** Evolución: el avance (0–100) al final de cada día con práctica del objetivo. */
  series: { at: string; pct: number }[];
  /** Siguiente paso de la ruta: el primero sin cumplir. */
  next: PasoProgreso | null;
}

const targetsOf = (foco: Foco): PlanPaso[] =>
  foco.plan && foco.plan.pasos.length > 0 ? foco.plan.pasos : foco.conceptIds.map((conceptId) => ({ conceptId, bloom: BLOOM_POR_DEFECTO, porque: '' }));

function stepsFrom(targets: PlanPaso[], concepts: Map<string, Concept>, insights: Map<string, ConceptInsight>): PasoProgreso[] {
  return targets.map((paso) => {
    const ins = insights.get(paso.conceptId);
    const maxBloom = ins?.maxBloom ?? null;
    return {
      paso,
      concept: concepts.get(paso.conceptId),
      state: ins?.state ?? 'no_visto',
      maxBloom,
      score: maxBloom === null ? 0 : Math.min(maxBloom / paso.bloom, 1),
      done: maxBloom !== null && maxBloom >= paso.bloom,
      lastPracticed: ins?.lastPracticed ?? null,
    };
  });
}

const percent = (pasos: PasoProgreso[]): number => (pasos.length === 0 ? 0 : Math.round((100 * pasos.reduce((a, p) => a + p.score, 0)) / pasos.length));

/**
 * Avance de un foco (R56): para cada concepto de su plan, qué Bloom demostraste frente al objetivo, qué retos lo
 * practican y cómo evolucionó el avance. Todo se deriva de la Evidence y del test final (R11, R23); no se guarda nada.
 */
export function computeFocoProgress(foco: Foco, data: { concepts: Concept[]; challenges: Challenge[]; evidence: Evidence[]; testResults: TestResult[] }, insights: Map<string, ConceptInsight>): FocoProgreso {
  const targets = targetsOf(foco);
  const conceptById = new Map(data.concepts.map((c) => [c.id, c]));
  const pasos = stepsFrom(targets, conceptById, insights);
  const wanted = new Set(targets.map((t) => t.conceptId));

  const stageConcepts = new Map(data.challenges.flatMap((c) => c.stages).map((s) => [s.id, s.conceptIds] as const));
  const touches = (stageId: string) => (stageConcepts.get(stageId) ?? []).some((id) => wanted.has(id));

  const lastByStage = new Map<string, string>();
  for (const e of data.evidence) if (touches(e.stageId) && (lastByStage.get(e.stageId) ?? '') < e.at) lastByStage.set(e.stageId, e.at);

  const retos: RetoLink[] = [];
  for (const challenge of data.challenges) {
    const byConcept = new Map<string, number[]>();
    for (const s of challenge.stages) for (const id of s.conceptIds) if (wanted.has(id)) byConcept.set(id, [...(byConcept.get(id) ?? []), s.number]);
    if (byConcept.size === 0) continue;
    const last = challenge.stages.map((s) => lastByStage.get(s.id) ?? null).reduce<string | null>((a, b) => (b && (!a || b > a) ? b : a), null);
    retos.push({ challenge, cells: [...byConcept].map(([conceptId, stageNumbers]) => ({ conceptId, stageNumbers })), last });
  }
  retos.sort((a, b) => a.challenge.id.localeCompare(b.challenge.id));

  const days = new Set<string>();
  for (const e of data.evidence) if (touches(e.stageId)) days.add(e.at.slice(0, 10));
  for (const t of data.testResults) if (wanted.has(t.conceptId)) days.add(t.at.slice(0, 10));
  const series: FocoProgreso['series'] = [...days].sort().map((day) => {
    const cut = `${day}T23:59:59.999Z`;
    const at = computeInsights(data.concepts, data.challenges, data.evidence.filter((e) => e.at <= cut), data.testResults.filter((t) => t.at <= cut));
    return { at: day, pct: percent(stepsFrom(targets, conceptById, at)) };
  });

  const lastActivity = [...lastByStage.values(), ...data.testResults.filter((t) => wanted.has(t.conceptId)).map((t) => t.at)].reduce<string | null>((a, b) => (!a || b > a ? b : a), null);

  return {
    pasos,
    pct: percent(pasos),
    done: pasos.filter((p) => p.done).length,
    started: pasos.filter((p) => p.state !== 'no_visto').length,
    retos,
    lastActivity,
    series,
    next: pasos.find((p) => !p.done) ?? null,
  };
}
