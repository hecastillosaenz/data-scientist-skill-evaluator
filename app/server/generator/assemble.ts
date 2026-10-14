import type { Challenge, Stage, StageContent, TestQuestion } from '../../shared/types';
import type { ChallengePlan } from './plan';
import type { Skeleton } from './workspace';

const QUESTIONS_BY_DIFFICULTY = { 1: 3, 2: 4, 3: 5 } as const;
export const businessQuestionCount = (difficulty: 1 | 2 | 3): number => QUESTIONS_BY_DIFFICULTY[difficulty];

/**
 * Arma el `challenge.json`. Lo que fija el plan (id, número, dificultad, y por etapa dominio, Bloom, dificultad, Apoyo y
 * mecanismo) lo escribe el orquestador, así el Generador no puede incumplirlo (R38); el Generador aporta el resto.
 * Las etapas aún sin contenido llevan `content: {}`, lo que permite validar por fases.
 */
export function assembleChallenge(plan: ChallengePlan, skeleton: Skeleton, contents: Record<string, unknown>, finalTest?: TestQuestion[]): Challenge {
  const stages: Stage[] = plan.stages.map((planned) => {
    const proposed = skeleton.stages.find((s) => s.number === planned.number);
    const extra = (proposed?.conceptIds ?? []).filter((id) => !planned.conceptIds.includes(id));
    return {
      id: `${plan.id}-s${planned.number}`,
      challengeId: plan.id,
      number: planned.number,
      title: proposed?.title ?? '',
      domain: planned.domain,
      difficulty: planned.difficulty,
      bloom: planned.bloom,
      estimatedMinutes: proposed?.estimatedMinutes ?? 0,
      mechanism: planned.mechanism,
      description: proposed?.description ?? '',
      conceptIds: [...planned.conceptIds, ...extra],
      apoyo: planned.apoyo,
      content: (contents[String(planned.number)] ?? {}) as StageContent,
    };
  });
  return {
    id: plan.id,
    number: plan.number,
    title: skeleton.title,
    dataset: skeleton.dataset,
    difficulty: plan.difficulty,
    recommended: false,
    objectives: skeleton.objectives,
    scenario: skeleton.scenario,
    task: skeleton.task,
    data: { engine: skeleton.data.engine, tables: skeleton.data.tables, seedSql: skeleton.data.seedSql },
    businessQuestions: skeleton.businessQuestions.map((q, i) => ({ id: `${plan.id}-bq${i + 1}`, text: q.text, ...(q.reflectionGuide ? { reflectionGuide: q.reflectionGuide } : {}) })),
    ...(finalTest ? { finalTest: finalTest.map((q, i) => ({ ...q, id: `${plan.id}-t${i + 1}` })) } : {}),
    stages,
  };
}

/** Celda `# Datos` estándar: abre la base DuckDB del challenge y, si no existe, la crea desde el seed (R24). */
export const DATA_CELL = `# Datos
# No edites esta celda: abre la base de datos del challenge (DuckDB). Si aún no existe, la crea desde datos/seed.sql.
import duckdb, pathlib

_db = pathlib.Path("datos/challenge.duckdb")
if not _db.exists():
    _con = duckdb.connect(str(_db))
    _con.execute(pathlib.Path("datos/seed.sql").read_text(encoding="utf-8"))
    _con.close()

con = duckdb.connect(str(_db), read_only=True)
`;

/** Código de la solución de referencia como celda ejecutable: el SQL se envuelve en `resultado = con.sql(...)`. */
export function referenceCell(stage: Pick<Stage, 'domain' | 'number'> & { content: StageContent }): string {
  const code = stage.content.solution?.code ?? '';
  const isSql = stage.content.skeleton?.language === 'sql' || (stage.content.skeleton === undefined && stage.domain === 'sql');
  if (!isSql) return `# Entregable - Etapa ${stage.number}:\n${code}`;
  return `# Entregable - Etapa ${stage.number}:\nresultado = con.sql("""\n${code.trim().replace(/;\s*$/, '')}\n""")`;
}

const lines = (text: string): string[] => text.split('\n').map((l, i, all) => (i < all.length - 1 ? `${l}\n` : l));
const md = (text: string) => ({ cell_type: 'markdown', metadata: {}, source: lines(text) });
const code = (text: string) => ({ cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: lines(text) });

/** Notebook del challenge: título, `# Datos` y, por etapa, su enunciado y la celda `# Entregable - Etapa X:` con el esqueleto (R8, R27). */
export function buildNotebook(challenge: Challenge): string {
  const cells: unknown[] = [
    md(
      `# ${challenge.title}\n\nResuelve cada etapa en su celda marcada. La verificación ejecuta solo la celda cuya **primera línea** es \`# Entregable - Etapa X:\` (después de las celdas \`# Datos\`).\n\nLee el enunciado, la teoría y los datos en la app (**Challenge actual**).`,
    ),
    code(DATA_CELL),
  ];
  for (const s of challenge.stages) {
    const columns = s.content.expected?.columns;
    const hint = s.mechanism === 'codigo_assert'
      ? `\n\nGuarda el resultado en la variable \`resultado\`${s.domain === 'sql' ? ' (por ejemplo `resultado = con.sql("""...""")`)' : ''}.${columns ? ` Columnas esperadas: ${columns.map((c) => `\`${c}\``).join(', ')}.` : ''}`
      : '\n\nEscribe tu respuesta en la celda de abajo.';
    cells.push(md(`## Etapa ${s.number} · ${s.title}${hint}`));
    if (s.mechanism === 'codigo_assert') {
      const skeleton = s.content.skeleton;
      const body = !skeleton ? 'resultado = None  # TODO'
        : skeleton.language === 'sql' ? `resultado = con.sql("""\n${skeleton.code.trim()}\n""")` : skeleton.code.trim();
      cells.push(code(`# Entregable - Etapa ${s.number}:\n${body}\n`));
    } else {
      cells.push(md(`# Entregable - Etapa ${s.number}:\n\n`));
    }
  }
  return `${JSON.stringify({ cells, metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } }, nbformat: 4, nbformat_minor: 5 }, null, 1)}\n`;
}

export const logHeader = (challengeId: string): string => `# Logs de avance · ${challengeId}\n\nEl orquestador registra aquí los intentos, el tiempo real y tus notas.\n`;
