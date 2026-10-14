import path from 'node:path';
import type { Concept, DomainId } from '../../shared/types';
import { configDir } from '../paths';
import { businessQuestionCount } from './assemble';
import type { ChallengePlan, PlannedStage } from './plan';
import type { Skeleton } from './workspace';

/** Prompt del sistema del Generador: solo lectura, sin ejecutar código, una única respuesta JSON (R9, R38, R39). */
export function generatorSystem(): string {
  return [
    'Eres el Generador de «Data Scientist Challenges», una app de práctica para una persona que está aprendiendo Data Science.',
    'Todo el texto va en español, en Markdown (fórmulas con $…$ y $$…$$; escapa los signos de moneda como \\$).',
    'Eres de solo lectura: puedes leer archivos con Read, Grep y Glob, pero NO ejecutes código ni modifiques nada. El orquestador ejecutará el seed y tu solución de referencia sobre los datos y rechazará lo que no coincida: calcula con cuidado, no inventes resultados.',
    'Lee primero el contrato y la plantilla que se te indican en el mensaje y síguelos.',
    'Tu respuesta final DEBE contener UN solo bloque ```json con exactamente la forma pedida y nada de texto después del bloque. Sin estilos, HTML ni emojis. No inventes campos fuera de la forma pedida.',
    'Es JSON estricto: dentro de los textos escribe los saltos de línea como \\n y DUPLICA cada barra invertida (LaTeX: \\\\frac, \\\\times; monedas: \\\\$). Respeta tildes y mayúsculas exactas de los datos del seed al escribir `expected`.',
  ].join('\n');
}

const TEMPLATE_BY_DOMAIN: Record<DomainId, string> = {
  sql: 'plantilla-sql.md',
  python: 'plantilla-python.md',
  cleaning: 'plantilla-python.md',
  math: 'plantilla-matematica.md',
  ml: 'plantilla-ml.md',
  business: 'plantilla-business.md',
};

const plantillas = (repoRoot: string) => path.join(configDir(repoRoot), 'plantillas');

const conceptLine = (id: string, concepts: Concept[]) => {
  const c = concepts.find((x) => x.id === id);
  return c ? `\`${c.id}\` «${c.name}»${c.prerequisites.length ? ` (prerrequisitos: ${c.prerequisites.join(', ')})` : ''}` : `\`${id}\``;
};

const stageLine = (s: PlannedStage, concepts: Concept[]) =>
  `- Etapa ${s.number} · ${s.role} · dominio ${s.domain} · conceptos: ${s.conceptIds.map((id) => conceptLine(id, concepts)).join('; ')} · Bloom ${s.bloom} · dificultad ${s.difficulty} · Apoyo ${s.apoyo} · mecanismo ${s.mechanism}.\n  Por qué: ${s.why}`;

function header(repoRoot: string, plan: ChallengePlan, concepts: Concept[]): string[] {
  const dir = plantillas(repoRoot);
  const templates = [...new Set(plan.stages.map((s) => TEMPLATE_BY_DOMAIN[s.domain]))];
  return [
    `# Generar el challenge ${plan.id} (${plan.mode === 'arranque' ? 'modo arranque' : 'calibrado'}, dificultad ${plan.difficulty})`,
    '',
    '## Léelo antes de escribir',
    `- Contrato: ${path.join(dir, 'contrato-generador.md')}`,
    `- Esquema: ${path.join(dir, 'challenge.schema.json')}`,
    ...templates.map((t) => `- Plantilla: ${path.join(dir, t)}`),
    '',
    '## Plan de calibración (lo decide el orquestador; NO lo cambies)',
    ...plan.stages.map((s) => stageLine(s, concepts)),
    '',
    `Dominio técnico: ${plan.domain}. No repitas estos datasets ni sectores: ${plan.avoid.datasets.length ? plan.avoid.datasets.map((d) => `«${d}»`).join(', ') : '(ninguno)'}; títulos recientes: ${plan.avoid.titles.length ? plan.avoid.titles.map((t) => `«${t}»`).join(', ') : '(ninguno)'}.`,
  ];
}

export function skeletonMessage(repoRoot: string, plan: ChallengePlan, concepts: Concept[]): string {
  const questions = businessQuestionCount(plan.difficulty);
  return [
    ...header(repoRoot, plan, concepts),
    '',
    '## Fase 1 · Esqueleto',
    'Diseña el caso: escenario de negocio, datos sintéticos y el enunciado de cada etapa. El contenido de estudio de cada etapa se pide después.',
    '',
    'Devuelve EXACTAMENTE esta forma (un único bloque ```json):',
    '```json',
    JSON.stringify(
      {
        title: 'Título corto con el sector, p. ej. «Seguros: siniestralidad por tipo de póliza»',
        dataset: 'Nombre corto del dataset',
        objectives: { lookingFor: 'Que … (1–2 frases)', outcomes: ['2 a 5 resultados concretos y verificables'], skills: ['1 a 6 habilidades, en pocas palabras'] },
        scenario: 'Markdown, 2–4 líneas: rol, organización, pregunta de negocio y decisión que informa el resultado',
        task: 'Markdown: la pregunta analítica concreta; define cada métrica con su fórmula',
        data: {
          engine: 'duckdb',
          tables: [{ name: 'snake_case', description: '…', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'otra_id', type: 'INTEGER', fk: { table: 'otra_tabla', column: 'id' }, nullable: false }], rowCount: 12, sampleRows: [[1, 2]] }],
          seedSql: 'CREATE TABLE … ; INSERT INTO … VALUES …;  (DuckDB; el seed completo)',
        },
        businessQuestions: [{ text: 'Conecta ESTE resultado con una decisión (≥ 20 caracteres)', reflectionGuide: 'Guía que se muestra solo después de responder' }],
        stages: plan.stages.map((s) => ({ number: s.number, title: '…', description: 'Markdown: la tarea concreta de la etapa', estimatedMinutes: 25, conceptIds: [...s.conceptIds] })),
      },
      null,
      2,
    ),
    '```',
    '',
    'Reglas:',
    `- Exactamente ${questions} preguntas de negocio, específicas a este caso.`,
    '- Tablas pequeñas y diseñadas a mano (8–20 filas) en DuckDB; `rowCount` es el número exacto de filas que inserta el seed y `sampleRows` son las primeras filas (hasta 8), en el orden de `columns` y del `INSERT`. Todo FK debe tener su fila padre.',
    plan.difficulty >= 2 ? '- Incluye imperfecciones a propósito (NULL, duplicados) que formen parte de las trampas del caso.' : '- Datos limpios; la dificultad está en el concepto, no en la limpieza.',
    '- Usa nombres de tablas y columnas en español, `snake_case`. El orquestador construirá la base con tu seed y comprobará `rowCount`, `sampleRows` y las llaves.',
    '- En `stages`, `conceptIds` incluye los conceptos del plan y, si quieres, hasta 3 conceptos de apoyo existentes en el grafo (cada uno con su id exacto). Los campos que fija el plan (dominio, Bloom, dificultad, Apoyo, mecanismo, id) los escribe el orquestador.',
    '- La etapa de integración (Business) pide una interpretación escrita para negocio, no código.',
  ].join('\n');
}

export function stageMessage(repoRoot: string, plan: ChallengePlan, concepts: Concept[], skeleton: Skeleton, number: number, extraConceptIds: string[]): string {
  const planned = plan.stages.find((s) => s.number === number)!;
  const proposed = skeleton.stages.find((s) => s.number === number)!;
  const isCode = planned.mechanism === 'codigo_assert';
  const sqlLike = planned.domain === 'sql';
  const allConcepts = [...planned.conceptIds, ...extraConceptIds];
  const shape: Record<string, unknown> = {
    theory: [{ title: 'Idea (3 a 5 ideas, con fórmulas si aplican)', body: 'Markdown: por qué importa PARA ESTE reto' }],
    workedExample: { domain: 'Otro dominio de negocio distinto al del reto', body: 'Markdown con datos distintos y resultado verificado; nunca resuelve el reto' },
    steps: ['4 a 7 pasos: qué hacer y cómo'],
    hints: ['Qué mirar y en qué orden, SIN dar la fórmula final ni el enfoque correcto'],
    research: [{ conceptId: 'id existente y presente en conceptIds', why: 'Por qué importa aquí', searchEs: 'búsqueda en español', searchEn: 'search in English' }],
    deliverables: ['Checklist verificable: columnas exactas, alias, orden, redondeo, interpretación de negocio y «Terminado cuando…»'],
    solution: {
      ...(isCode ? { code: sqlLike ? 'UNA consulta SQL de DuckDB sobre las tablas del seed (sin `resultado =`)' : 'Código Python que define `resultado` o pasa los asserts' } : {}),
      expectedResult: '…', reasoning: '…', conceptLinks: 'qué concepto se usa en qué paso', businessInterpretation: 'incluye una limitación', commonError: 'con los números que da el error', dsFlow: 'en qué momento del trabajo real aparece', skill: '…',
    },
  };
  if (isCode) {
    shape.skeleton = { language: sqlLike ? 'sql' : 'python', code: 'Esqueleto con TODO por completar (no revela la solución)' };
    shape.expected = { columns: ['…'], rows: [['…']] };
    if (!sqlLike) shape.asserts = '(alternativa a `expected`) asserts de Python que ejecuta el orquestador tras la celda del usuario';
  }
  return [
    ...header(repoRoot, plan, concepts),
    '',
    `## Fase 2 · Contenido de la Etapa ${number}: ${proposed.title}`,
    `Tarea de la etapa: ${proposed.description}`,
    `Conceptos de la etapa: ${allConcepts.map((id) => conceptLine(id, concepts)).join('; ')}.`,
    `Mecanismo: ${planned.mechanism} (${isCode ? 'el orquestador ejecuta tu solución de referencia y la compara con `expected`' : 'el Evaluador califica la respuesta escrita con los `deliverables` como rúbrica'}).`,
    '',
    '## El caso (ya fijado)',
    `Título: ${skeleton.title}`,
    `Escenario: ${skeleton.scenario}`,
    `Tarea del challenge: ${skeleton.task}`,
    '',
    'Seed de los datos (DuckDB):',
    '```sql',
    skeleton.data.seedSql,
    '```',
    '',
    `Etapas del challenge: ${skeleton.stages.map((s) => `${s.number}. ${s.title}`).join(' · ')}.`,
    '',
    'Devuelve EXACTAMENTE esta forma (el objeto `content` de la etapa, en un único bloque ```json):',
    '```json',
    JSON.stringify(shape, null, 2),
    '```',
    '',
    'Reglas:',
    '- Produce TODAS las capas de ayuda; la UI muestra las que corresponden al Apoyo vigente.',
    ...(isCode
      ? [
          '- `solution.code` se ejecuta tal cual sobre el seed: debe correr sin error y reproducir `expected` (columnas en el mismo orden, mismas filas en el mismo orden, redondeo explícito con `ROUND`). Calcula `expected` a partir de los datos del seed, fila por fila.',
          '- `skeleton` deja `TODO` para lo esencial y NO contiene la solución.',
        ]
      : ['- Etapa conceptual: no incluyas `skeleton`, `expected` ni `solution.code`; los `deliverables` son la rúbrica con la que se califica.']),
    '- `research`: 3 a 4 conceptos, del más básico al más cercano al problema; cada `conceptId` debe estar entre los conceptos de la etapa.',
    '- `hints` y `steps` no revelan la solución.',
  ].join('\n');
}

export function testMessage(repoRoot: string, plan: ChallengePlan, concepts: Concept[], skeleton: Skeleton, conceptIds: string[]): string {
  return [
    ...header(repoRoot, plan, concepts),
    '',
    '## Fase 3 · Test final de retención',
    `Escribe de 5 a 8 preguntas APLICADAS (un caso breve, no una definición) sobre lo que practica este challenge («${skeleton.title}»).`,
    `Cada pregunta se ata a un concepto de esta lista: ${conceptIds.map((id) => conceptLine(id, concepts)).join('; ')}.`,
    '',
    'Devuelve EXACTAMENTE esta forma (un único bloque ```json):',
    '```json',
    JSON.stringify(
      {
        finalTest: [
          { conceptId: 'id de la lista', bloom: 1, kind: 'opcion_multiple', prompt: 'Markdown: caso breve + pregunta', options: ['3 a 5 opciones'], correctIndex: 0, explanation: 'Por qué es correcta y qué error evita' },
          { conceptId: 'id de la lista', bloom: 2, kind: 'numerica', prompt: '…', answer: 42, tolerance: 0.01, explanation: '…' },
          { conceptId: 'id de la lista', bloom: 3, kind: 'texto', prompt: '…', rubric: 'Criterio con el que se califica', explanation: '…' },
        ],
      },
      null,
      2,
    ),
    '```',
    '',
    'Reglas:',
    '- `bloom` es 1, 2 o 3. `kind` es `opcion_multiple` (con `options` y `correctIndex`), `numerica` (con `answer`, y `tolerance` si hace falta) o `texto` (con `rubric`).',
    '- Calcula cada respuesta numérica con cuidado a partir de los datos del caso; no la adivines.',
    '- Reparte las preguntas entre los conceptos del challenge. Las opciones erróneas deben ser errores plausibles.',
  ].join('\n');
}

/** Reparación (R39): la misma petición, la respuesta anterior y los errores del validador, con el campo. */
export function repairMessage(original: string, previous: string, errors: string[]): string {
  return [
    original,
    '',
    '## Tu respuesta anterior fue rechazada',
    '```',
    previous.length > 12_000 ? `${previous.slice(0, 12_000)}\n… (recortada)` : previous,
    '```',
    '',
    '## Problemas que debes corregir',
    ...errors.slice(0, 12).map((e) => `- ${e}`),
    '',
    'Corrige solo esos problemas y devuelve el JSON COMPLETO de nuevo, en un único bloque ```json.',
  ].join('\n');
}

export { extractJson, fixInvalidEscapes } from '../agents/json';
