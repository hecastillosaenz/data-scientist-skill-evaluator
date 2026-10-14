import type { Apoyo, Challenge, Stage } from '../../shared/types';
import type { Comparison } from './compare';
import type { RunResult } from './notebook-runner';

export type Verdict = 'aprobada' | 'parcial' | 'fallida';

const APOYO_RULE: Record<Apoyo, string> = {
  guiado: 'Apoyo GUIADO: puedes señalar el paso concreto que falló y por qué, pero no escribas la solución completa.',
  pistas: 'Apoyo PISTAS: da una o dos pistas sobre qué revisar, sin decir cuál es el error exacto ni escribir código de la solución.',
  autonomo: 'Apoyo AUTÓNOMO: describe el síntoma observable (qué no coincide) sin explicar la causa ni dar pistas de cómo arreglarlo.',
};

/** Prompt del sistema del Evaluador. Es de solo lectura y no comparte contexto con el Generador (R9, R14). */
export function evaluatorSystem(): string {
  return [
    'Eres el Evaluador de «Data Scientist Challenges», una app de práctica para una persona que está aprendiendo Data Science.',
    'Responde siempre en español, en Markdown, de forma directa y breve (máximo ~150 palabras). Sin saludos ni relleno.',
    'Eres de solo lectura: puedes leer archivos de la carpeta del challenge si lo necesitas, pero nunca ejecutas código ni modificas nada.',
    'Nunca reveles la solución de referencia completa. Explica qué ocurrió y cómo orientarse, según el nivel de Apoyo que se te indique.',
  ].join('\n');
}

const trim = (text: string, max = 2000) => (text.length > max ? `${text.slice(0, max)}\n… (recortado)` : text);

export interface CodeMessageInput {
  challenge: Challenge;
  stage: Stage;
  apoyo: Apoyo;
  code: string;
  run: RunResult;
  comparison: Comparison | null;
  passed: boolean;
}

/** Mensaje para el Evaluador de código: el veredicto ya lo decidió el orquestador; el agente solo explica (R9). */
export function codeMessage({ challenge, stage, apoyo, code, run, comparison, passed }: CodeMessageInput): string {
  const lines = [
    `# Etapa ${stage.number}: ${stage.title}`,
    `Challenge: ${challenge.title}`,
    '',
    '## Tarea',
    stage.description,
    '',
    '## Entregable esperado',
    ...(stage.content.deliverables ?? []).map((d) => `- ${d}`),
    '',
    '## Código del usuario (celda entregable)',
    '```',
    trim(code, 4000),
    '```',
    '',
    '## Ejecución (la hizo el orquestador, no tú)',
    run.timedOut ? 'La celda superó el tiempo máximo y se cortó.' : `Código de salida: ${run.exitCode}.`,
    ...(run.stdout ? ['Salida estándar:', '```', trim(run.stdout), '```'] : []),
    ...(run.stderr ? ['Errores:', '```', trim(run.stderr), '```'] : []),
    ...(run.harnessError ? [`Aviso del arnés: ${run.harnessError}`] : []),
    ...(comparison ? ['', '## Comparación con el resultado esperado', comparison.match ? 'Coincide exactamente.' : comparison.problems.map((p) => `- ${p}`).join('\n')] : []),
    '',
    `## Veredicto ya decidido por el orquestador: ${passed ? 'APROBADA' : 'NO PASÓ'}`,
    APOYO_RULE[apoyo],
    passed
      ? 'Felicita en una línea y comenta en una frase algo que el usuario pueda mejorar o consolidar.'
      : 'Explica en pocas líneas qué falló y cómo orientarse, respetando el nivel de Apoyo.',
  ];
  return lines.join('\n');
}

export interface ConceptualMessageInput {
  challenge: Challenge;
  stage: Stage;
  apoyo: Apoyo;
  answer: string;
}

/** Mensaje para el Evaluador conceptual: aplica la rúbrica y termina con la línea de veredicto (R9, HU7). */
export function conceptualMessage({ challenge, stage, apoyo, answer }: ConceptualMessageInput): string {
  const reference = stage.content.solution?.code ?? stage.content.solution?.reasoning ?? '';
  return [
    `# Etapa ${stage.number}: ${stage.title}`,
    `Challenge: ${challenge.title}`,
    '',
    '## Tarea',
    stage.description,
    '',
    '## Criterios (entregable)',
    ...(stage.content.deliverables ?? []).map((d) => `- ${d}`),
    ...(reference ? ['', '## Respuesta de referencia (solo para ti; no la reveles ni la cites)', trim(reference, 3000)] : []),
    '',
    '## Respuesta del usuario',
    trim(answer, 4000),
    '',
    '## Instrucciones',
    'Evalúa la respuesta contra los criterios. No hay una única respuesta correcta: valora si es completa, específica y defendible.',
    APOYO_RULE[apoyo],
    'Termina SIEMPRE con una última línea exacta, sin nada después: `VEREDICTO: correcta`, `VEREDICTO: parcial` o `VEREDICTO: incorrecta`.',
  ].join('\n');
}

/** Extrae el veredicto de la última línea del agente y devuelve el texto sin esa línea. */
export function parseVerdict(text: string): { status: Verdict; feedback: string; found: boolean } {
  const match = /^\s*VEREDICTO:\s*(correcta|parcial|incorrecta)\s*$/im.exec(text);
  const feedback = text.replace(/^\s*VEREDICTO:.*$/gim, '').trim();
  if (!match) return { status: 'parcial', feedback, found: false };
  const word = match[1]!.toLowerCase();
  return { status: word === 'correcta' ? 'aprobada' : word === 'parcial' ? 'parcial' : 'fallida', feedback, found: true };
}
