import { BLOCKER_LABEL, APOYO_LABEL, DOMAIN_BY_ID } from '../../shared/domains';
import type { Candidate, Challenge, Concept, Evidence, Observation, Stage } from '../../shared/types';
import { ANALYST_RULES } from './apply';

/** Prompt del sistema del Analista: solo lectura, propone y no escribe (R9, R41). */
export function analystSystem(): string {
  return [
    'Eres el Analista de «Data Scientist Challenges», una app de práctica para una persona que está aprendiendo Data Science.',
    'Lees lo que la persona escribió sobre una etapa que acaba de registrar y propones cómo reflejarlo en su grafo de conocimiento.',
    'Todo el texto va en español. Eres de solo lectura y NO modificas nada: devuelves una propuesta y el orquestador decide qué aplicar.',
    'Sé conservador: vincula solo con conceptos de la lista, propón un prerrequisito solo si la nota lo evidencia, y no inventes temas que la nota no menciona.',
    'Tu respuesta final DEBE contener UN solo bloque ```json con exactamente la forma pedida y nada de texto después. JSON estricto: saltos de línea como \\n y barras invertidas duplicadas.',
  ].join('\n');
}

export interface AnalystContext {
  challenge: Challenge;
  stage: Stage;
  evidence: Evidence;
  concepts: Concept[];
  observations: Observation[];
  candidates: Candidate[];
}

const trim = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}… (recortado)` : text);

export function analystMessage({ challenge, stage, evidence, concepts, observations, candidates }: AnalystContext): string {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const stageConcepts = stage.conceptIds.map((id) => byId.get(id)).filter((c): c is Concept => !!c);
  const domains = new Set([stage.domain, ...stageConcepts.map((c) => c.domain)]);
  const catalog = concepts.filter((c) => domains.has(c.domain)).slice(0, 160);
  const recent = observations
    .filter((o) => o.status === 'ok' && o.conceptIds.some((id) => stage.conceptIds.includes(id)))
    .slice(-5);
  const minutes = `${evidence.actualMinutes} min reales frente a ${stage.estimatedMinutes} de objetivo`;

  return [
    `# Analiza el registro de la Etapa ${stage.number}: ${stage.title}`,
    `Challenge: ${challenge.title}`,
    '',
    '## Lo que registró la persona',
    `- Resultado: ${evidence.result} · Apoyo ${APOYO_LABEL[evidence.apoyo]} · ${evidence.withHelp ? 'abrió la solución (Con ayuda)' : 'sin abrir la solución'} · ${minutes}.`,
    `- Dónde se trabó: ${evidence.blocker ? BLOCKER_LABEL[evidence.blocker] : '(no lo marcó)'}.`,
    evidence.notes ? `- Notas libres:\n${evidence.notes.trim().split('\n').map((l) => `  > ${l}`).join('\n')}` : '- Notas libres: (no escribió)',
    '',
    '## La etapa',
    `Tarea: ${trim(stage.description, 800)}`,
    `Conceptos que practica: ${stageConcepts.map((c) => `\`${c.id}\` «${c.name}»${c.prerequisites.length ? ` (prerrequisitos: ${c.prerequisites.join(', ')})` : ''}`).join('; ') || '(ninguno)'}.`,
    '',
    `## Conceptos existentes de ${[...domains].map((d) => DOMAIN_BY_ID[d].short).join(', ')} (usa estos ids exactos)`,
    ...catalog.map((c) => `- \`${c.id}\` ${c.name}`),
    '',
    '## Observaciones previas sobre estos conceptos',
    ...(recent.length ? recent.map((o) => `- ${o.conceptIds.join(', ')}: ${o.diagnosis}`) : ['(ninguna)']),
    '',
    '## Temas sin cubrir ya detectados (candidatos)',
    ...(candidates.length ? candidates.map((c) => `- «${c.label}» (${c.domain}) en ${c.evidenceIds.length} ${c.evidenceIds.length === 1 ? 'registro' : 'registros'}`) : ['(ninguno)']),
    '',
    'Devuelve EXACTAMENTE esta forma (un único bloque ```json):',
    '```json',
    JSON.stringify(
      {
        conceptIds: ['ids existentes a los que se refiere la nota'],
        diagnosis: `Qué le cuesta y por qué, en una o dos frases (hasta ${ANALYST_RULES.maxDiagnosis} caracteres)`,
        uncovered: [{ label: 'Tema que la nota menciona y NO está en la lista', domain: 'sql' }],
        addPrerequisites: [{ concept: 'id que figura en conceptIds', prerequisite: 'id existente', why: 'Por qué la nota lo evidencia' }],
        createConcepts: [{ name: 'Nombre del concepto', domain: 'sql', prerequisites: ['ids existentes'], candidateLabel: 'label exacto del candidato' }],
      },
      null,
      2,
    ),
    '```',
    '',
    'Reglas:',
    '- `conceptIds`: solo ids de la lista de conceptos existentes. Si la nota no habla de ninguno, deja la lista vacía.',
    `- \`addPrerequisites\`: como máximo ${ANALYST_RULES.maxLinks}, solo si la nota deja claro que falta una base; si no, deja la lista vacía.`,
    `- \`uncovered\`: solo temas concretos que la nota menciona y que ningún concepto cubre. Reutiliza el \`label\` exacto de un candidato si es el mismo tema.`,
    `- \`createConcepts\`: casi siempre vacía. El orquestador solo crea un concepto cuando el tema ya aparece en ${ANALYST_RULES.recurrence} registros distintos (candidatos); propónlo únicamente si este registro lo completa.`,
    '- No repitas las notas: aporta el diagnóstico.',
  ].join('\n');
}

export function analystRepair(original: string, previous: string, error: string): string {
  return [original, '', '## Tu respuesta anterior fue rechazada', '```', trim(previous, 8000), '```', '', `Problema: ${error}`, '', 'Devuelve el JSON COMPLETO de nuevo, en un único bloque ```json.'].join('\n');
}
