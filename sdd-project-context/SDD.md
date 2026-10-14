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

**Contenido y estudio** *(añadidas tras la revisión de la UI con datos de ejemplo)*
- **HU13.** Como usuario, quiero que cada etapa traiga el material para estudiar antes de resolver (escenario de negocio, teoría aplicada con fórmulas, un ejemplo resuelto en otro dominio, paso a paso y esqueleto de código), según mi nivel de Apoyo, para no depender de buscar la teoría por fuera.
- **HU14.** Como usuario, quiero ver el esquema de datos del challenge como un diagrama relacional con sus llaves y unas filas de muestra, para entender las tablas antes de escribir una consulta.
- **HU15.** *(Revisada.)* Como usuario, quiero **un único cronómetro global** (inicio/pausa) que reparta el tiempo entre etapas al registrarlas, y que me pregunte qué hacer con el tiempo si me ausento, para registrar mi tiempo real sin estimarlo ni contar pausas largas por error.
- **HU16.** Como usuario, quiero ver en vivo, debajo del botón de verificar, qué está haciendo el sistema y recibir feedback ahí mismo si algo falla, para entender el resultado sin salir de la pantalla.
- **HU17.** Como usuario, quiero responder las preguntas de negocio dentro de la app y ver una guía de reflexión después, para practicar la comunicación con negocio.
- **HU18.** Como usuario, quiero un test final de preguntas aplicadas al terminar el challenge, para comprobar si recuerdo bien los conceptos.
- **HU19.** Como usuario, quiero elegir entre modo claro, oscuro o el del sistema, para trabajar cómodo a cualquier hora.
- **HU20.** Como usuario, quiero que los challenges con base de datos traigan datos sintéticos reproducibles, para poder ejecutar mis consultas sin preparar nada.
- **HU21.** Como usuario, quiero ver al inicio de cada challenge sus **objetivos** (qué busca y qué obtendré al terminar), para saber para qué practico.
- **HU22.** Como usuario, quiero una **ventana de análisis de cada debilidad** que explique en qué estoy fallando, por qué y cómo mejorar, para actuar sin tener que inferirlo.
- **HU23.** Como usuario, quiero, además del grafo de conceptos, un **grafo unificado (second brain)** donde se vean juntos conceptos, challenges, etapas, tests y mejoras, para entender cómo interactúa todo.
- **HU24.** Como autor, quiero que el formato de presentación de un caso quede guardado como contrato para los agentes (esquema y plantillas), para que cada challenge generado se vea y se estudie igual.

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
- **R9.** *(Revisado.)* Ningún agente (Generador, Evaluador, Analista) DEBE tener `Bash` habilitado, en ningún modo. La ejecución de código de la celda entregable la realiza el **orquestador** (R27) en un proceso propio con timeout; el Evaluador recibe su salida y, en solo lectura (`Read`/`Grep`/`Glob` acotados con `--add-dir` a `challenge-N/`), redacta el feedback. *Motivo: mismo resultado para el usuario sin darle un shell a un agente; alineado con el patrón de solo lectura de panamahealth.*
- **R10.** Cada verificación DEBE crear un nuevo registro de Evidence; NO DEBE sobrescribir evidencias previas de la misma etapa.
- **R11.** El estado de un Concept DEBE calcularse a partir del último intento de cada etapa vinculada, no del historial completo.
- **R16.** El número de Etapa en el marcador `# Entregable - Etapa X:` DEBE coincidir con el número de etapa declarado en los metadatos del challenge; si no coincide, el sistema DEBE rechazar la verificación con un error explícito, no asumir cuál es la correcta.

**Registro y grafo**
- **R12.** ⚠️ *Deuda de diseño.* El agente Analista DEBE ejecutarse después de cada Evidence; la condición exacta bajo la cual crea o refuerza nodos `Concept` a partir de `notas_libres` aún no está definida.
- **R13.** El Analista NO DEBE modificar de forma persistente `configuracion-retos/` salvo `knowledge-graph.json`.
- **R14.** El agente Evaluador NO DEBE compartir contexto de sesión con el agente Generador al evaluar una etapa que ese Generador creó.

**Exploración**
- **R15.** La pantalla de Grafo DEBE mostrar todos los dominios simultáneamente por defecto; los chips de dominio DEBEN actuar como filtro/atenuador, no como condición de visibilidad.

**Contenido, datos y registro** *(añadidos tras la revisión de la UI)*
- **R17.** Cada etapa DEBE poder llevar contenido rico con campos opcionales: teoría aplicada (con fórmulas), ejemplo resuelto en otro dominio, paso a paso, pistas, esqueleto de código, conceptos para investigar (con búsquedas en español e inglés), entregable como checklist, resultado esperado y solución por secciones. La UI DEBE revelarlo según el Apoyo vigente: *Guiado* = teoría, ejemplo, paso a paso y esqueleto; *Pistas* = pistas ordenadas y conceptos; *Autónomo* = conceptos y entregable. Leer la teoría, el ejemplo o el paso a paso NO DEBE marcar el intento como "Con ayuda" (solo R7).
- **R18.** El Generador DEBE emitir, para todo challenge con datos, un dataset reproducible: `datos/seed.sql` (DuckDB) o `datos/seed.py` (semilla fija), con imperfecciones (nulos, duplicados) desde Nivel 2. La estructura (tablas, llaves PK/FK, filas de muestra) DEBE quedar en `challenge.json` para dibujar el diagrama sin ejecutar el seed.
- **R19.** El Generador DEBE ejecutar la solución de referencia contra el dataset y guardar el resultado como `expected`; si la ejecución falla o no coincide con lo que declara el challenge, DEBE rechazar el challenge.
- **R20.** *(Revisado.)* Existe **un único cronómetro global**, no uno por etapa. El Tiempo real de una etapa es el tiempo transcurrido desde el último registro (o desde que se inició el cronómetro), descontando las pausas; si el usuario lo edita a mano, el registro DEBE quedar marcado `manual`. Investigar los conceptos y leer la teoría NO cuentan en el Tiempo real (el usuario inicia el cronómetro al empezar a resolver).
- **R21.** Al terminar todas las etapas, el sistema DEBE ofrecer un test final de 5 a 8 preguntas aplicadas (opción múltiple, numérica o de texto), cada una atada a un Concept y a un nivel de Bloom 1–3. El test NO es requisito para marcar el challenge como completado.
- **R22.** Las respuestas a las preguntas de negocio DEBEN guardarse como registros append-only, NO DEBEN determinar Acierto/Fallo, y la guía de reflexión DEBE mostrarse solo después de guardarlas. El número de preguntas es 3 en Nivel 1–2, 4 en Nivel 3 y 5 en Nivel 4–5.
- **R23.** El último resultado de cada pregunta del test final DEBE contar como un intento del Concept al que está atada (con su Bloom), aplicando el mismo principio que R11.
- **R24.** Para los challenges con SQL, la base `challenge-N/datos/challenge.duckdb` DEBE construirse desde el seed de forma idempotente, estar ignorada por git y abrirse en el notebook con `read_only=True`.
- **R25.** Los endpoints del orquestador que lanzan procesos (agente o runner) DEBEN rechazar peticiones cuyo `Host` u `Origin` no sea `127.0.0.1:<puerto>`.
- **R26.** La verificación DEBE emitir eventos NDJSON (`step`, `output`, `tool`, `feedback`, `result`, `done`, `error`) que la UI muestra en vivo debajo del botón, con opción de cancelar. Los errores (celda no encontrada, R16, `claude` ausente, timeout) DEBEN mostrarse con mensaje explícito en ese mismo panel.
- **R28.** Todo `challenge.json` DEBE incluir los **objetivos del reto**: qué busca el challenge, qué obtendrá el usuario al terminar (resultados concretos) y las habilidades que entrena.
- **R29.** El formato de un challenge es un contrato: `configuracion-retos/plantillas/challenge.schema.json` define su estructura y las plantillas por Tipo definen su contenido. El orquestador DEBE validar el `challenge.json` contra ese esquema antes de aceptarlo y rechazarlo con un error explícito si no cumple.
- **R30.** Si el cronómetro está corriendo y la app deja de dar señal por más de 3 minutos (pestaña cerrada, equipo suspendido), al volver la app DEBE preguntar qué hacer con ese intervalo: no contarlo (por defecto), contarlo o pausar. NUNCA DEBE sumarlo en silencio.
- **R31.** Cada debilidad de la cola de Repaso DEBE poder abrirse en una ventana de análisis que muestre: el diagnóstico (qué falla y desde cuándo), la evidencia (intentos, bloqueos y notas), las posibles causas raíz (prerrequisitos débiles), el error común del caso y un plan de mejora con pasos concretos.
- **R32.** El grafo unificado DEBE mostrar nodos de cinco tipos (concepto, challenge, etapa, test y mejora) con sus relaciones, permitir atenuar por tipo y por dominio sin ocultar nada (como R15) y abrir el detalle de cualquier nodo.
- **R27.** Las celdas del notebook cuya primera línea sea `# Datos` (no editables por el usuario) DEBEN ejecutarse antes de la celda `# Entregable - Etapa X:`; la celda entregable se ejecuta aislada del resto de celdas del usuario (R8). El proceso tiene timeout y tope de salida.

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
| AC-R9 | Dado cualquier rol de agente y cualquier modo de evaluación, cuando se construye su invocación, entonces `Bash` figura en `--disallowedTools` y no en `--allowedTools`. |
| AC-R10 | Dado un intento fallido previo y un reintento aprobado, entonces existen dos registros Evidence distintos. |
| AC-R11 | Dado un Concept con Evidence antigua (fallo) y reciente (éxito) en la misma etapa, entonces su estado refleja solo la más reciente. |
| AC-R12 | ⚠️ No verificable — "PUEDE" sin condición asociada. |
| AC-R13 | Dado una ejecución del Analista, cuando termina, entonces el único archivo modificado bajo `configuracion-retos/` es `knowledge-graph.json`. |
| AC-R14 | Dado una etapa generada por el Generador, cuando el Evaluador la evalúa, entonces se invoca como sesión nueva sin contexto heredado. |
| AC-R15 | Dado la pantalla de Grafo recién abierta, entonces se muestran nodos de los 6 dominios sin selección previa. |
| AC-R16 | Dado un marcador `# Entregable - Etapa X:` cuyo X no coincide con los metadatos del challenge, cuando se verifica, entonces el sistema rechaza con error explícito. |
| AC-R17 | Dado una etapa en Apoyo Guiado, cuando se abre, entonces se ven teoría, ejemplo, paso a paso y esqueleto; en Autónomo solo conceptos y entregable; y leer la teoría no marca "Con ayuda". |
| AC-R18 | Dado un challenge con datos, cuando se inspecciona `challenge.json`, entonces lista cada tabla con columnas, PK/FK y filas de muestra, y existe un `seed` ejecutable. |
| AC-R19 | Dado un challenge cuya solución de referencia no reproduce `expected`, cuando el Generador termina, entonces el challenge se rechaza. |
| AC-R20 | Dado el cronómetro global iniciado, cuando se recarga la página, entonces el tiempo transcurrido se conserva; y al registrar dos etapas seguidas, cada una recibe solo el tiempo desde el registro anterior. |
| AC-R21 | Dado un challenge con etapas sin completar, entonces el test final está bloqueado; con todas completas, se desbloquea. |
| AC-R22 | Dado un challenge, cuando no se han guardado las respuestas de negocio, entonces la guía de reflexión no se muestra; al guardar, se muestra y existe un registro nuevo (no sobrescrito). |
| AC-R23 | Dado un Concept con un intento de etapa aprobado y un fallo reciente en el test final, entonces su estado es "Con fallos" y aparece en la cola de Repaso. |
| AC-R24 | Dado un seed, cuando se construye la base dos veces, entonces el resultado es idéntico y el archivo `.duckdb` no aparece en `git status`. |
| AC-R25 | Dado una petición al endpoint de verificación con `Host` distinto de `127.0.0.1:<puerto>`, entonces se rechaza sin lanzar ningún proceso. |
| AC-R26 | Dado una verificación en curso, cuando el usuario pulsa "Detener", entonces el proceso se cancela y el panel lo indica; y los eventos llegan en el orden `step … feedback … result … done`. |
| AC-R28 | Dado un `challenge.json` sin objetivos, cuando se valida, entonces se rechaza con un error que nombra el campo faltante. |
| AC-R29 | Dado un `challenge.json` que no cumple el esquema, cuando el orquestador lo carga, entonces lo rechaza con un mensaje explícito; y `challenge-001` y todos los ejemplos lo cumplen. |
| AC-R30 | Dado un cronómetro corriendo y 10 minutos sin señal, cuando la app vuelve, entonces pregunta qué hacer con el intervalo y, por defecto, no lo suma. |
| AC-R31 | Dada una debilidad por fallos, cuando se abre su análisis, entonces se ven la evidencia, las causas raíz, el error común y los pasos de mejora. |
| AC-R32 | Dado el grafo unificado recién abierto, entonces se ven nodos de los cinco tipos y los 6 dominios, y filtrar por un tipo atenúa los demás sin ocultarlos. |
| AC-R27 | Dado un notebook con celdas `# Datos` y `# Entregable - Etapa X:`, cuando se verifica, entonces se ejecutan las de datos y luego la entregable, y un exceso de tiempo termina el proceso con un error explícito. |

**Deuda de diseño que bloquea implementación real (marcada, no resuelta por decisión explícita del autor):**
- Heurística de calibración del Generador (R2/R4).
- Condición de disparo del Analista para crear/reforzar nodos (R12).
- Manejo de errores no cubierto por ningún requisito: agotamiento de `--max-budget-usd` a mitad de generación y corrupción de `knowledge-graph.json`. *(Celda `# Entregable` no encontrada y timeout quedan cubiertos por R26/R27.)*
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
│   ├── challenge.json        # fuente de verdad: metadatos, etapas, contenido, esquema, test final
│   ├── datos/
│   │   ├── seed.sql | seed.py
│   │   └── challenge.duckdb  # generado, ignorado por git (R24)
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
| `challenge-fs` | Leer/crear/escribir `challenge-N/` y construir `datos/challenge.duckdb` desde el seed | R1, R3, R18, R24 |
| `notebook-runner` | Ejecutar en un proceso con timeout las celdas `# Datos` + la entregable y comparar con `expected` | R8, R27 |
| `verify-service` | Orquestar parser → runner → agente evaluador y emitir los eventos NDJSON | R9, R14, R25, R26 |

### 6.4 Decisiones de arquitectura cerradas

1. **Comunicación frontend↔orquestador:** servidor Node local en `127.0.0.1`, levantado con `npm run app`, que abre el navegador. Frontend consume por `fetch`/NDJSON.

   **Patrón de invocación del agente (`agent-runner`), autocontenido:**
   - El servidor **no tiene API key ni habla con la API de Anthropic**: lanza el binario `claude` (Claude Code) ya instalado y autenticado en la máquina, que usa la sesión/suscripción del usuario.
   - Invocación con `spawn('claude', args)`, **sin shell**, mensaje enviado por **stdin** (nunca como argumento posicional, para evitar colisión con `--allowedTools`/escapes).
   - Flags base: `-p` (no interactivo) `--output-format stream-json --verbose` (salida JSON línea a línea) `--permission-mode dontAsk` (sin nadie para aprobar, lo no permitido se rechaza) `--max-budget-usd <n>` (tope de gasto por llamada).
   - Scope de herramientas por rol (S4): Generador y Analista → `--allowedTools Read Grep Glob` con `--disallowedTools Bash Edit Write WebFetch WebSearch Task` (solo lectura, nunca escriben directo — devuelven propuestas que el orquestador aplica). el Evaluador en ambos modos (`código_assert` y `rubric_claude`) también es de solo lectura, con `--add-dir challenge-N/` (R9 revisado): en `código_assert` la celda la ejecuta el `notebook-runner` del orquestador y el agente solo explica el resultado; además cada evaluación usa `--no-session-persistence` (R14).
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

> **Nota de orden.** P6 y P7 se construyeron antes que los agentes, sobre datos de ejemplo. Tras revisar la UI, P1 (`agent-runner`), P2 (`notebook-parser`) y una porción de P4 (verificación en vivo, R25–R27) se adelantan con un `challenge-001/` real para probar de punta a punta; P3 y P5 siguen bloqueados por su deuda de diseño.

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

### 8.1 Cambios tras la primera revisión de la UI

- **Contenido rico (R17–R19, R24).** Los enunciados de una línea eran insuficientes. El formato sale de las plantillas del Notion del autor (Plantilla · SQL/Python/Business Analytics): escenario → datos → teoría aplicada → ejemplo resuelto en otro dominio → paso a paso → esqueleto → entregable verificable → preguntas de negocio → solución por secciones. La solución incluye "cómo se conectan los conceptos", "error común", "conexión con el flujo de DS" y "habilidad que entrena".
- **Datos sintéticos (HU20, R18–R19, R24).** El Generador diseña tablas pequeñas a mano (8–20 filas) para que la tabla esperada sea verificable, o un `seed.py` con semilla fija cuando hace falta volumen; ejecuta la solución de referencia para obtener `expected`. Motor: **DuckDB** (sintaxis cercana a PostgreSQL, sin servidor). El `.venv` del proyecto no trae paquetes: `requirements.txt` lista los necesarios.
- **Cronómetro (R20).** Se mide en el navegador con marcas de tiempo (no se desvía si la pestaña se throttlea) y persiste en `localStorage`; más adelante el orquestador lo registrará en `logs-avance.md`.
- **Verificación en vivo (R25–R27, HU16).** Panel bajo el botón con línea de tiempo y feedback. La ejecución de la celda es del orquestador, no de un agente (R9 revisado).
- **Columna "Entrega" retirada.** Pegar/Subir/Enlace no encaja con el flujo (el usuario resuelve en su notebook de VS Code, HU5). La columna lateral pasa a "Registro de la etapa": cronómetro, "¿Dónde te trabaste?", notas y registrar.
- **Test final (R21, R23).** Cuenta como evidencia de Bloom 1–3, así que el nivel "Recordar/Comprender", vacío hasta ahora, empieza a tener datos.
- **Implementado en el adelanto de P1/P2/P4.** `agent-runner`, `notebook-parser`/`notebook-runner` y `verify-service` existen y están probados con un `claude` falso y con DuckDB real (`challenge-001`). Quedan fuera: Generador (P3) y Analista (P5), y registrar el cronómetro y las respuestas en `logs-avance.md`.
- **Veredicto.** En etapas de código lo decide el orquestador (ejecución + comparación con `expected`/asserts); el Evaluador solo redacta el feedback y no puede cambiarlo. En etapas conceptuales el Evaluador aplica la rúbrica y termina con `VEREDICTO: correcta|parcial|incorrecta`; si no lo indica, cuenta como parcial.
- **Convención de la celda SQL.** La celda entregable asigna el resultado a la variable `resultado` (relación de DuckDB, DataFrame o lista de diccionarios); el orquestador la serializa y la compara con `expected` (mismas columnas sin distinguir mayúsculas, mismas filas en el mismo orden). Por eso el entregable exige el `ROUND` del enunciado.
- **Respuestas conceptuales en el notebook.** En los challenges reales la respuesta de una etapa conceptual se escribe en la celda markdown `# Entregable - Etapa N:` (como define §6.4.3); la UI ya no ofrece un cuadro de texto para esos casos.
- **Contenido Markdown.** Los signos de moneda se escapan como `\$` para que KaTeX no los lea como fórmula.
- **Tensión R10 sin resolver.** La Evidence se sigue creando al pulsar «Registrar etapa» (que añade tiempo, bloqueo y notas), no al verificar. Falta decidir si cada verificación debe crear la suya.

### 8.2 Cambios tras la segunda revisión de la UI

- **Cronómetro global con vueltas (R20, R30).** Un solo reloj para todo el trabajo; «Registrar etapa» toma una *vuelta*: el tiempo desde el último registro. Así Analítica conserva el tiempo por etapa. Como el usuario resuelve en VS Code, la app NO se pausa cuando la pestaña pierde el foco; el reloj corre por marcas de tiempo. Si la app desaparece (pestaña cerrada, equipo suspendido) y vuelve tras más de 3 minutos, pregunta qué hacer con ese intervalo; lo no contado por defecto es el intervalo ausente.
- **Objetivos del reto (R28).** Cada challenge dice qué busca, qué obtendrás y qué habilidades entrena. Es parte del contrato del Generador.
- **Formato como contrato para los agentes (R29).** `challenge.schema.json` (JSON Schema) y las plantillas por Tipo en `configuracion-retos/plantillas/` fijan cómo se presenta un caso: escenario → objetivos → datos → etapas (teoría, ejemplo, paso a paso, esqueleto, entregable, solución) → preguntas de negocio → test final. El Generador los lee y el orquestador valida su salida.
- **Ventana de debilidad (R31)** y **grafo unificado (R32)** salen de la UI; el análisis de debilidad es determinista (deriva de la evidencia) y puede enriquecerse más adelante con el Analista.
- **Presentación.** Texto justificado, columna de lectura centrada, tablas centradas y sin anillos alrededor de cuadrículas; la etapa desplegada se enfatiza con un sombreado gradual, no con un borde.

