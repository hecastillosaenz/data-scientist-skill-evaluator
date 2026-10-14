# SDD — data-scientist-skill-evaluator

> Especificación dirigida por desarrollo (SDD), nivel de madurez **Spec-Anchored**. Metodología: cadena de Contexto de Producto (Épica → Historias de Usuario → Requisitos → Criterios de Aceptación) y cadena de Contexto de Tecnología (Standards → System Design → Delivery Contract), adaptada de forma proporcionada para un proyecto personal de un solo desarrollador/usuario.
>
> Repositorio: `data-scientist-skill-evaluator`. Autor: Helio Castillo ("Besto").

---

## Fase 1 — Épica

Reemplazar el sistema actual de retos diarios de Data Science en Notion (registro manual en "Logs Skill Daily", con Apoyo/Nivel por Tipo) por una aplicación local, de un solo usuario, que genera, resuelve y evalúa **challenges multi-etapa** mediante agentes de Claude Code sobre la suscripción existente del autor, y que mantiene un **grafo de conocimiento visual** vinculando la evidencia real de desempeño con los conceptos de las 6 áreas de Data Science (SQL, Python, Matemática Aplicada, Machine Learning, Limpieza y Visualización, Business Analytics). El objetivo es pasar de practicar ejercicios sueltos sin visibilidad real de fortalezas/debilidades, a un sistema que calibra la dificultad y el enfoque de la práctica a partir de evidencia acumulada.

---

## Fase 2 — Historias de Usuario (aprobadas)

**Generación**
- **HU1.** Como usuario, quiero iniciar manualmente la generación de un nuevo challenge, para practicar cuando yo decida, sin depender de una tarea programada en la nube.
- **HU2.** Como usuario, quiero que el Generador consulte el estado de mi grafo de conocimiento antes de elegir el Tipo y los conceptos del challenge, para que la práctica se oriente a mis debilidades reales.
- **HU3.** Como usuario, quiero que cada etapa generada tenga asignado su nivel cognitivo de Bloom, su Tipo/Tema y su mecanismo de evaluación, para saber qué tipo de esfuerzo exige y cómo se va a verificar.

**Resolución**
- **HU4.** Como usuario, quiero elegir el nivel de Apoyo (Guiado/Pistas/Autónomo) de forma independiente para cada etapa, para ajustar la ayuda según mi confianza en ese tema específico.
- **HU5.** Como usuario, quiero resolver cada etapa en mi propio notebook de VS Code, para trabajar en mi entorno habitual sin cambiar de herramienta.

**Verificación**
- **HU6.** Como usuario, quiero que el sistema ejecute de forma aislada solo la celda marcada como entregable de cada etapa contra los criterios de esa etapa, para obtener una verificación objetiva de código sin correr todo el notebook.
- **HU7.** Como usuario, quiero que las etapas conceptuales se evalúen con un agente que aplique una rúbrica, para recibir una verificación cualitativa en temas que no se verifican con asserts.
- **HU8.** Como usuario, quiero poder reintentar una etapa fallida sin que ese fallo me penalice permanentemente, para no ser castigado por errores ya corregidos.

**Registro y grafo**
- **HU9.** Como usuario, quiero dejar notas libres sobre mis dificultades en cada etapa, para que esa información alimente el grafo de conocimiento.
- **HU10.** Como usuario, quiero que un agente Analista actualice el grafo de conocimiento después de cada evidencia registrada, para que el grafo refleje mi desempeño real sin que yo tenga que mantenerlo manualmente.

**Exploración**
- **HU11.** Como usuario, quiero ver un grafo de conocimiento visual que cruce los 6 dominios por defecto, para entender cómo se relacionan mis fortalezas y debilidades entre áreas.
- **HU12.** Como usuario, quiero una cola de repaso priorizada derivada del grafo, para saber qué practicar primero sin tener que inferirlo yo mismo.

---

## Fase 3 — Requisitos (normativo, RFC 2119)

**Generación**
- **R1.** El sistema DEBE permitir iniciar un challenge únicamente mediante acción manual del usuario; NO DEBE ejecutar generación automática por temporizador o tarea programada en la nube.
- **R2.** ⚠️ *Deuda de diseño.* Al generar un challenge, el agente Generador DEBE consultar el estado actual de `knowledge-graph.json` antes de seleccionar Tipo y Concept para cada etapa, según una heurística de calibración aún no definida.
- **R3.** Cada etapa generada DEBE especificar: Tipo, Tema, nivel cognitivo (Bloom 1–6), Apoyo inicial, y mecanismo de evaluación (`código_assert` | `rubric_claude`).
- **R4.** ⚠️ *Deuda de diseño.* Si el volumen de Evidence acumulada es insuficiente (umbral exacto sin definir), el Generador DEBE priorizar dificultad básica sobre calibración fina.

**Resolución**
- **R5.** El usuario DEBE poder fijar el Apoyo (Guiado/Pistas/Autónomo) de forma independiente por etapa.
- **R6.** Mientras una etapa esté en Apoyo Guiado o Pistas, su Nivel NO DEBE subir.
- **R7.** Abrir el toggle de Solución DEBE marcar el intento como "Con ayuda" sin importar el resultado posterior.

**Verificación**
- **R8.** Para etapas `código_assert`, el sistema DEBE ubicar la celda cuya primera línea sea `# Entregable - Etapa X:` y ejecutarla de forma aislada contra los asserts de esa etapa.
- **R9.** El agente Evaluador NO DEBE tener `Bash` habilitado al evaluar etapas `rubric_claude`; SÍ DEBE tenerlo habilitado y acotado vía `--add-dir` a `challenge-N/` al evaluar etapas `código_assert`.
- **R10.** Cada verificación DEBE crear un nuevo registro de Evidence; NO DEBE sobrescribir evidencias previas de la misma etapa.
- **R11.** El estado de un Concept DEBE calcularse a partir del último intento de cada etapa vinculada, no del historial completo.
- **R16.** El número de Etapa en el marcador `# Entregable - Etapa X:` DEBE coincidir con el número de etapa declarado en los metadatos del challenge; si no coincide, el sistema DEBE rechazar la verificación con un error explícito, no asumir cuál es la correcta.

**Registro y grafo**
- **R12.** ⚠️ *Deuda de diseño.* El agente Analista DEBE ejecutarse después de cada Evidence; la condición exacta bajo la cual crea o refuerza nodos `Concept` a partir de `notas_libres` aún no está definida.
- **R13.** El Analista NO DEBE modificar de forma persistente `configuracion-retos/` salvo `knowledge-graph.json`.
- **R14.** El agente Evaluador NO DEBE compartir contexto de sesión con el agente Generador al evaluar una etapa que ese Generador creó.

**Exploración**
- **R15.** La pantalla de Grafo DEBE mostrar todos los dominios simultáneamente por defecto; los chips de dominio DEBEN actuar como filtro/atenuador, no como condición de visibilidad.

---

## Fase 4 — Criterios de Aceptación

| ID | Criterio (Given/When/Then) |
|---|---|
| AC-R1 | Dado que no hay challenge activo, cuando el usuario presiona "Iniciar nuevo challenge", entonces el Generador se invoca una sola vez. |
| AC-R2 | ⚠️ No verificable — bloqueado por la heurística de calibración sin definir. |
| AC-R3 | Dado un challenge recién generado, cuando se inspecciona cada etapa, entonces tiene no-vacíos: Tipo, Tema, nivel Bloom, Apoyo inicial, mecanismo de evaluación. |
| AC-R4 | ⚠️ No verificable — mismo bloqueo que AC-R2, más el umbral N sin definir. |
| AC-R5 | Dado un challenge con ≥2 etapas, cuando se cambia el Apoyo de una, entonces el Apoyo de las demás no cambia. |
| AC-R6 | Dado una etapa en Guiado/Pistas, cuando se registra un acierto, entonces su Nivel no incrementa. |
| AC-R7 | Dado cualquier etapa, cuando se abre el toggle de Solución, entonces el intento se marca "Con ayuda". |
| AC-R8 | Dado un notebook con `# Entregable - Etapa X:` como primera línea de una celda, cuando se presiona "Verificar etapa", entonces solo esa celda se ejecuta contra los asserts. |
| AC-R9 | Dado una etapa `rubric_claude`, cuando el Evaluador procesa la respuesta, entonces `Bash` no está en su lista de herramientas permitidas. |
| AC-R10 | Dado un intento fallido previo y un reintento aprobado, entonces existen dos registros Evidence distintos. |
| AC-R11 | Dado un Concept con Evidence antigua (fallo) y reciente (éxito) en la misma etapa, entonces su estado refleja solo la más reciente. |
| AC-R12 | ⚠️ No verificable — "PUEDE" sin condición asociada. |
| AC-R13 | Dado una ejecución del Analista, cuando termina, entonces el único archivo modificado bajo `configuracion-retos/` es `knowledge-graph.json`. |
| AC-R14 | Dado una etapa generada por el Generador, cuando el Evaluador la evalúa, entonces se invoca como sesión nueva sin contexto heredado. |
| AC-R15 | Dado la pantalla de Grafo recién abierta, entonces se muestran nodos de los 6 dominios sin selección previa. |
| AC-R16 | Dado un marcador `# Entregable - Etapa X:` cuyo X no coincide con los metadatos del challenge, cuando se verifica, entonces el sistema rechaza con error explícito. |

**Deuda de diseño que bloquea implementación real (marcada, no resuelta por decisión explícita del autor):**
- Heurística de calibración del Generador (R2/R4).
- Condición de disparo del Analista para crear/reforzar nodos (R12).
- Manejo de errores no cubierto por ningún requisito: celda `# Entregable` no encontrada, agotamiento de `--max-budget-usd` a mitad de generación, corrupción de `knowledge-graph.json`.
- Alcance de "Nivel del usuario" (Trainee→Básico→Intermedio→Avanzado, ver §9.7 Delivery Contract) sin decidir.

---

## Fase 5 — Standards

- **S1.** Persistencia DEBE ser basada en archivos versionados por git (markdown + JSON) dentro del repo; NO DEBE introducirse una base de datos en esta fase.
- **S2.** Toda invocación a un agente DEBE usar `spawn('claude', ...)` reutilizando la suscripción existente; NO DEBE usarse `ANTHROPIC_API_KEY` ni facturación por API.
- **S3.** Cada rol de agente (Generador, Evaluador, Analista) DEBE ejecutarse como proceso hijo independiente con `cwd` neutro.
- **S4.** El scope de herramientas por agente DEBE declararse explícitamente vía `--allowedTools`/`--disallowedTools`/`--settings`.
- **S5.** `knowledge-graph.json` DEBE ser el único store de estado del grafo.
- **S6.** Todo cambio a `knowledge-graph.json` DEBE ser atómico (archivo temporal + rename).
- **S7.** El front-end DEBE ejecutarse enteramente en local, sin despliegue remoto ni autenticación.

---

## Fase 6 — System Design

### 6.1 Arquitectura de alto nivel

```
Frontend (React, local) ──fetch/NDJSON──► Servidor Node local (127.0.0.1)
                                               │ mutex en memoria (una operación en vuelo)
                              ┌────────────────┼──────────────────┐
                         Generador          Evaluador           Analista
                         (spawn claude)     (spawn claude)      (spawn claude)
                              │                  │                  │
                              └──────────────────┴──────────────────┘
                                               │
                             Filesystem del repo (git-versionado)
                       configuracion-retos/  +  challenge-N/
```

### 6.2 Estructura de repo

```
data-scientist-skill-evaluator/
├── configuracion-retos/
│   ├── tipos-y-temas.md
│   ├── reglas-apoyo-nivel.md
│   ├── plantillas/
│   └── knowledge-graph.json
├── challenge-001/
│   ├── problema.md
│   ├── notebook.ipynb
│   └── logs-avance.md
├── challenge-002/
└── app/
```

### 6.3 Módulos del orquestador

| Módulo | Responsabilidad | Requisitos |
|---|---|---|
| `graph-store` | Leer/escribir `knowledge-graph.json` de forma atómica | S5, S6 |
| `notebook-parser` | Ubicar `# Entregable - Etapa X:` en celdas código/markdown, validar número de etapa | R8, R16 |
| `agent-runner` | Wrapper sobre `spawn('claude', ...)`, parametrizado por rol | S2–S4, R14 |
| `evidence-log` | Append-only de registros Evidence | R10, R11 |
| `challenge-fs` | Crear/escribir `challenge-N/` | R1, R3 |

### 6.4 Decisiones de arquitectura cerradas

1. **Comunicación frontend↔orquestador:** servidor Node local en `127.0.0.1`, levantado con `npm run app`, que abre el navegador. Frontend consume por `fetch`/NDJSON.

   **Patrón de invocación del agente (`agent-runner`), autocontenido:**
   - El servidor **no tiene API key ni habla con la API de Anthropic**: lanza el binario `claude` (Claude Code) ya instalado y autenticado en la máquina, que usa la sesión/suscripción del usuario.
   - Invocación con `spawn('claude', args)`, **sin shell**, mensaje enviado por **stdin** (nunca como argumento posicional, para evitar colisión con `--allowedTools`/escapes).
   - Flags base: `-p` (no interactivo) `--output-format stream-json --verbose` (salida JSON línea a línea) `--permission-mode dontAsk` (sin nadie para aprobar, lo no permitido se rechaza) `--max-budget-usd <n>` (tope de gasto por llamada).
   - Scope de herramientas por rol (S4): Generador y Analista → `--allowedTools Read Grep Glob` con `--disallowedTools Bash Edit Write WebFetch WebSearch Task` (solo lectura, nunca escriben directo — devuelven propuestas que el orquestador aplica). Evaluador en modo `código_assert` → además de lectura, `Bash` habilitado y acotado exclusivamente vía `--add-dir challenge-N/` (R9); Evaluador en modo `rubric_claude` → `Bash` deshabilitado, igual que Generador/Analista.
   - `--settings` con `permissions.deny` para `.env`, `.git`, `node_modules` y cualquier carpeta fuera de `challenge-N/` o `configuracion-retos/`.
   - Entorno del proceso hijo: `ANTHROPIC_API_KEY: ''` (vacía explícitamente, para forzar el uso de la suscripción y no de facturación por API) y `cwd` en un directorio temporal neutro (nunca la raíz del repo, para no heredar ningún `CLAUDE.md` propio del proyecto).
   - Salida: se parsea línea a línea (`stream-json`); eventos relevantes son `assistant` (texto + `tool_use`) y `result` (`is_error`, `total_cost_usd`, `session_id`). Se reenvía al frontend como NDJSON.
   - El Generador y el Analista **nunca escriben archivos directamente** — devuelven un bloque de propuesta estructurada que el orquestador valida y aplica él mismo (mantiene control total sobre qué se escribe en `configuracion-retos/` y `challenge-N/`, incluso con herramientas de escritura deshabilitadas en el agente).
2. **Concurrencia:** mutex en memoria dentro del proceso del servidor — una sola operación de escritura en vuelo; una segunda solicitud se rechaza con mensaje explícito, no se encola.
3. **Formato del marcador de entregable:** `# Entregable - Etapa X:` como primera línea de cualquier celda (código o markdown). Código → ruta `código_assert` (R8). Markdown → ruta `rubric_claude`, contenido bajo el encabezado se pasa al Evaluador. El número de etapa se valida contra los metadatos del challenge (R16).

---

## Fase 7 — Delivery Contract

### 7.1 Disposición del PRD de referencia (`PRD · Plataforma de retos data science`, v1.0)

| Sección PRD | Disposición |
|---|---|
| §7 Sistema visual | Se adopta tal cual (ver `UI-UX.md`) |
| §8 Componentes compartidos | Se adopta tal cual |
| §9.1–9.4, 9.6 Pantallas (Inicio, Challenges, Challenge actual, Repaso, Analítica) | Se adopta; "API/backend" se lee como "orquestador local" |
| §9.5 Grafo de conocimiento | Se adopta **con corrección obligatoria**: cross-domain-by-default (R15) sustituye el estado vacío "ninguno seleccionado" del PRD original |
| §9.7 Login/registro/onboarding/perfil | Se excluye — sin autenticación ni multiusuario |
| §10 Estados globales | Se adopta salvo "Sesión caducada" |
| §11 Lógica de negocio | Se adopta como fórmulas canónicas; §11.3 (estado de concepto) se construye sobre R11, no lo reemplaza |
| §11.6 Reto de refuerzo | Se adopta; fuente = generación por agente (no banco curado) |
| §11.7 Nivel del usuario | **[DECISIÓN ABIERTA PARA EL AUTOR]** — sin resolver en este SDD |
| §12 Modelo de datos (PostgreSQL) | Se excluye — sustituido por S1 |
| §13 API REST | Se excluye — sustituido por las operaciones del orquestador local |
| §14 Arquitectura de backend (Postgres/Redis/S3/Auth0) | Se excluye por completo |
| §15.1 Evaluación de código | Se adapta: Evaluador vía `spawn`, no sandbox gestionado |
| §15.2 Evaluación conceptual | Se adapta: agente Evaluador en modo `rubric_claude`, no LLM genérico externo |
| §15.3 Límites de contención | Se excluye — no aplica a un solo usuario |
| §16 Eventos de analítica de producto | Se excluye |
| §17 Accesibilidad | Se adopta como buena práctica, no como gate de aceptación |
| §18 Responsive | Se adopta tal cual |
| §19 Rendimiento (SLA tipo SaaS) | Se excluye casi todo; sobrevive solo 60fps en grafo hasta 200+ nodos |
| §20 Seguridad (Argon2, rate-limiting, antivirus) | Se excluye; sobrevive el aislamiento del Evaluador (S4, R9) |
| §21 Iconografía | Se adopta |
| §22–24 Métricas de éxito, roadmap, decisiones abiertas | Se excluyen — son métricas de producto multiusuario |
| §25–26 Anexos (datos de ejemplo, copy) | Se adoptan como referencia de tono/estructura para datos sintéticos |

### 7.2 Paquetes de entrega (orden de dependencia)

1. **P0** — Esqueleto de archivos y orquestador (servidor local, mutex). *(S1, S6, S7)*
2. **P1** — `agent-runner` + roles con aislamiento de contexto. *(S2–S4, R14)*
3. **P2** — `notebook-parser`. *(R8, R16)*
4. **P3** — Generador (bloqueado por R2/R4 sin resolver). *(R1–R4)*
5. **P4** — Evaluador código + conceptual. *(R8–R10, R16)*
6. **P5** — Analista + `graph-store` (bloqueado por R12 sin resolver). *(R11–R13, S5–S6)*
7. **P6** — Frontend: Inicio, Challenges, Challenge actual, Repaso, Analítica. *(`UI-UX.md` §§1–4, 6)*
8. **P7** — Frontend: Grafo de conocimiento con cross-domain-by-default. *(R15, `UI-UX.md` §5)*

### 7.3 Deuda total que debe resolverse antes de P3 y P5

- Heurística de calibración del Generador.
- Condición de disparo del Analista.
- Manejo de errores (celda no encontrada, budget agotado, JSON corrupto).
- Alcance de "Nivel del usuario".

---

## Fase 8 — Decisiones y supuestos de la UI con datos de ejemplo

La UI se construyó antes que los agentes (P6/P7 adelantados) sobre datos sintéticos, detrás de `app/web/src/data/repository.ts`. El PRD de referencia (§11 fórmulas, §25–26 datos) no está en el repo, así que lo siguiente es **provisional** y falta ratificarlo:

- **Estado de Concept** (`domain/conceptState.ts`): sin intentos → No visto; algún último intento fallido → Con fallos; todos aprobados sin ayuda → Dominado; cualquier otro caso (parcial o con ayuda) → Visto. Sigue R11 (solo el último intento de cada etapa).
- **Prioridad de la cola de repaso** (`domain/reviewQueue.ts`): base por motivo (fallos 100, parcial 70, ayuda 60, olvido 40) + 5 × fallos históricos de la etapa + 2 × conceptos dependientes + 0.3 × días desde la práctica. «Olvido» = dominado hace más de 21 días.
- **Nivel del usuario** (`domain/stats.ts`): Trainee / Básico / Intermedio (≥3 etapas de dificultad 2 aprobadas sin ayuda) / Avanzado (≥3 de dificultad 3). Sigue siendo la decisión abierta de §7.3.
- **Meta semanal** de 5 etapas para el subtítulo de Inicio.
- **Estado de Etapa y de Challenge se derivan** de la evidencia; no se almacenan.
- **Tensión R10 vs. UI-UX §4.3**: R10 dice que *cada verificación* crea una Evidence, pero el flujo de UI-UX separa "Verificar etapa" de "Registrar etapa" (que captura tiempo real, dónde te trabaste y notas). La UI actual crea la Evidence al **registrar**. Hay que decidir si la verificación crea la Evidence y "Registrar" la completa con un registro adicional, o si el resultado verificado queda pendiente hasta registrar.
- **Layout del grafo**: un carril horizontal por dominio (R15: los 6 dominios visibles al abrir), capas de izquierda a derecha por camino más largo de prerrequisitos. Con ~240 conceptos, pan/zoom sostiene ~13 ms por frame.

