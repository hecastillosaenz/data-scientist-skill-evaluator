# data-scientist-skill-evaluator

App local de un solo usuario que genera, resuelve, evalúa y registra challenges multi-etapa de Data Science mediante agentes de Claude Code, y mantiene un grafo de conocimiento visual. Autor: Helio Castillo.

## Contexto (fuente de verdad)
- `sdd-project-context/SDD.md` — épica, historias, requisitos R1–R16, criterios de aceptación (AC-R*), standards S1–S7, system design y paquetes de entrega P0–P7.
- `sdd-project-context/UI-UX.md` — sistema visual, componentes y pantallas.

Antes de implementar un paquete, leer la sección correspondiente. Si algo contradice al SDD, avisar; no resolverlo en silencio.

## Stack
- **App:** servidor Node local en `127.0.0.1` (`npm run app`) + frontend React. Todo local, sin auth ni despliegue (S7).
- **Agentes:** `spawn('claude', ...)` sobre la suscripción existente; nunca `ANTHROPIC_API_KEY` ni facturación por API (S2).
- **Python (`.venv/`):** solo es el entorno para ejecutar los notebooks de los challenges. No es parte de la app.

### Comandos (desde la raíz)
- `npm run app` — compila el frontend, levanta el orquestador en `127.0.0.1:4317` (o `PORT`) y abre el navegador.
- `npm run dev` — servidor con `tsx watch` + Vite con proxy a `/api`.
- `npm test` — vitest (`app/test/`). `npm run typecheck` — `tsc --noEmit`.
- Entorno Python de los notebooks (no es parte de la app): `uv pip install --python .venv/bin/python -r requirements.txt`.
- La verificación real necesita Claude Code instalado y con sesión iniciada (`claude` una vez en una terminal); sin él, las etapas de código siguen dando el resultado automático y las conceptuales avisan.

### Estructura de `app/` (un solo `package.json`, TypeScript, Fastify)
- `server/` — `app.ts` (`buildApp`, testeable con `inject()`), `mutex.ts`, `atomic-write.ts`, `ndjson.ts`, `start.ts` (`HOST` fijo en loopback), `guard.ts` (R25: Host/Origin locales), `paths.ts`, `index.ts`.
  - `agents/agent-runner.ts` — `spawn('claude', …)` sin shell, mensaje por stdin, `ANTHROPIC_API_KEY` vacía, `cwd` neutro, solo lectura (nunca Bash, R9). `CLAUDE_BIN` lo sustituye en los tests.
  - `verify/` — `notebook-parser` (celda `# Entregable - Etapa X:`, R16, celdas `# Datos`), `notebook-runner` (Python con timeout; traduce tracebacks), `compare`, `evaluator-prompts`, `verify-service` (eventos NDJSON, R26).
  - `challenges/challenge-fs.ts` — lee `challenge-N/challenge.json` y reconstruye `datos/challenge.duckdb` desde el seed (R24).
- `challenge-001/` (raíz del repo) — reto **real**: `challenge.json`, `datos/seed.sql`, `notebook.ipynb`, `logs-avance.md`. Los ids reales son el nombre de la carpeta; los de ejemplo son `c001`…
- `shared/` — contrato de datos (`types.ts`) y metadatos de dominios/etiquetas (`domains.ts`).
- `web/` — React + Vite + react-router, CSS plano con variables (tokens de UI-UX §1.3); el build (`web/dist`) lo sirve el propio servidor.
  - `src/screens/` — Inicio, Challenges, ChallengeActual, Repaso, Grafo, Analítica. `src/components/`, `src/charts/` (SVG propio), `src/layout/`.
  - `src/domain/` — lógica pura y testeada (estado de concepto R11, cola de repaso, filtros, layout del grafo, analítica, líneas de lectura, `weakness` (ventana de debilidad), `brainGraph`/`forceLayout` (second brain), `timekeeper` (cronómetro global con vueltas y ausencias)).
  - `src/data/` — **datos de ejemplo** (`sample/`) detrás de `repository.ts`, el único punto a reemplazar por `fetch` al orquestador. `?escenario=nuevo|sin-challenge|racha-rota` fuerza los estados vacíos de Inicio.

## Formato de los challenges (contrato para los agentes)
`configuracion-retos/plantillas/` guarda cómo se presenta un caso: `challenge.schema.json` (JSON Schema, R29), `contrato-generador.md` y una plantilla por tipo de reto. El orquestador valida cada `challenge.json` en modo estricto (`server/challenges/validate.ts`) y rechaza con un mensaje explícito lo que no cumpla. Orden de presentación: objetivos → enunciado → datos → etapas → preguntas de negocio → test final. Si cambias el modelo (`app/shared/types.ts`), actualiza el esquema, las plantillas y los tests.

## Estilo de la UI
Sin anillos ni contornos de 1px en cuadrículas, chips ni campos (fondo y sombra); el foco de teclado sí conserva su anillo. Texto largo **justificado** en una **columna de lectura centrada** (`--column`); tablas centradas; la etapa desplegada se enfatiza con un sombreado gradual, no con un borde.

## Standards que no se negocian
- Persistencia en archivos versionados por git (markdown + JSON); sin base de datos (S1).
- Cada rol (Generador, Evaluador, Analista) es un proceso hijo independiente con `cwd` neutro (S3) y tools declaradas con `--allowedTools`/`--disallowedTools`/`--settings` (S4).
- `knowledge-graph.json` es el único store del grafo (S5) y se escribe de forma atómica: tmp + rename (S6).
- Evaluador `rubric_claude` sin `Bash`; Evaluador `código_assert` con `Bash` acotado por `--add-dir` a `challenge-N/` (R9).
- El Evaluador nunca comparte contexto de sesión con el Generador (R14).
- Una sola operación de escritura en vuelo (mutex en memoria); la segunda se rechaza, no se encola.
- Los agentes (Generador, Evaluador, Analista) son de solo lectura: **nadie ejecuta código salvo el orquestador** (`notebook-runner`).
- Marcador de entregable: `# Entregable - Etapa X:` como primera línea de la celda; X debe coincidir con los metadatos del challenge o se rechaza con error explícito (R8, R16).

## Estado de la UI
Las 6 pantallas funcionan con challenges **de ejemplo** (`data/sample/`) más los **reales** de `challenge-N/` (los reales sustituyen al de ejemplo con el mismo título). La verificación de los reales es de verdad (notebook + DuckDB + Evaluador de Claude); la de los de ejemplo, el refuerzo y «Iniciar challenge» siguen **simulados** (`domain/simulateVerify.ts`, `domain/reinforcement.ts`). El **cronómetro es uno solo y global** (vueltas por registro; pregunta qué hacer si la app estuvo ausente más de 3 min) y, junto con las respuestas de negocio, vive en el navegador (`localStorage`) hasta que el orquestador los guarde en `logs-avance.md`. Las fórmulas derivadas son **provisionales** (SDD, Fase 8).

Contenido de los challenges: Markdown con KaTeX; **escapa los signos de moneda como `\$`** para que no se lean como fórmula. Las respuestas numéricas y las tablas esperadas se verifican ejecutándolas (SQLite/DuckDB) antes de publicarlas.

## Cómo trabajamos
- Una sesión = un paquete de entrega (P0–P7, ver SDD §7.2). Plan Mode primero, luego implementar.
- Los AC del SDD son la definición de terminado: se escriben como tests.
- **P3 y P5 están bloqueados** por deuda de diseño (SDD §7.3): calibración del Generador, disparo del Analista, manejo de errores, alcance de "Nivel del usuario". Resolverla en el SDD antes de implementar.
- Un commit por paquete (o por subpaso si es grande).

## Git
- Mensajes de commit en inglés, imperativo, cortos.
- **No agregar a Claude como coautor** (sin línea `Co-Authored-By`) ni atribución en commits ni PRs.
