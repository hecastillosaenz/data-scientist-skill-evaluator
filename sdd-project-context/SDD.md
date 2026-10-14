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
- **R2.** *(Resuelta, ver R38.)* Al generar un challenge, el estado actual de `knowledge-graph.json` y de la evidencia DEBE determinar el Tipo y los Concepts de cada etapa. El orquestador calcula un plan de calibración (R38) y se lo entrega al Generador; el Generador no elige los conceptos.
- **R3.** Cada etapa generada DEBE especificar: Tipo, Tema, nivel cognitivo (Bloom 1–6), Apoyo inicial, y mecanismo de evaluación (`código_assert` | `rubric_claude`).
- **R4.** *(Resuelta, ver R38.)* Si hay menos Evidence que el umbral de `calibracion.json` (8 por defecto), el plan DEBE ser de arranque: dificultad básica, todo en Apoyo Guiado.

**Resolución**
- **R5.** El usuario DEBE poder fijar el Apoyo (Guiado/Pistas/Autónomo) de forma independiente por etapa.
- **R6.** Mientras una etapa esté en Apoyo Guiado o Pistas, su Nivel NO DEBE subir.
- **R7.** Abrir el toggle de Solución DEBE marcar el intento como "Con ayuda" sin importar el resultado posterior.

**Verificación**
- **R8.** Para etapas `código_assert`, el sistema DEBE ubicar la celda cuya primera línea sea `# Entregable - Etapa X:` y ejecutarla de forma aislada contra los asserts de esa etapa.
- **R9.** *(Revisado.)* Ningún agente (Generador, Evaluador, Analista) DEBE tener `Bash` habilitado, en ningún modo. La ejecución de código de la celda entregable la realiza el **orquestador** (R27) en un proceso propio con timeout; el Evaluador recibe su salida y, en solo lectura (`Read`/`Grep`/`Glob` acotados con `--add-dir` a `challenge/challenge-NNN/`), redacta el feedback. *Motivo: mismo resultado para el usuario sin darle un shell a un agente; alineado con el patrón de solo lectura de panamahealth.*
- **R10.** *(Revisado y ratificado por el autor el 2026-10-14.)* La **Evidence es el intento oficial** y se crea al pulsar «Registrar etapa» (con el resultado de la última verificación, el tiempo real, el bloqueo y las notas); verificar por sí solo es un borrador que se puede repetir y NO crea Evidence. Cada registro DEBE ser un Evidence nuevo; NO DEBE sobrescribir evidencias previas de la misma etapa.
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
- **R24.** Para los challenges con SQL, la base `challenge/challenge-NNN/datos/challenge.duckdb` DEBE construirse desde el seed de forma idempotente, estar ignorada por git y abrirse en el notebook con `read_only=True`.
- **R25.** Los endpoints del orquestador que lanzan procesos (agente o runner) DEBEN rechazar peticiones cuyo `Host` u `Origin` no sea `127.0.0.1:<puerto>`.
- **R26.** La verificación DEBE emitir eventos NDJSON (`step`, `output`, `tool`, `feedback`, `result`, `done`, `error`) que la UI muestra en vivo debajo del botón, con opción de cancelar. Los errores (celda no encontrada, R16, `claude` ausente, timeout) DEBEN mostrarse con mensaje explícito en ese mismo panel.
- **R28.** Todo `challenge.json` DEBE incluir los **objetivos del reto**: qué busca el challenge, qué obtendrá el usuario al terminar (resultados concretos) y las habilidades que entrena.
- **R29.** El formato de un challenge es un contrato: `configuracion-retos/plantillas/challenge.schema.json` define su estructura y las plantillas por Tipo definen su contenido. El orquestador DEBE validar el `challenge.json` contra ese esquema antes de aceptarlo y rechazarlo con un error explícito si no cumple.
- **R30.** Si el cronómetro está corriendo y la app deja de dar señal por más de 3 minutos (pestaña cerrada, equipo suspendido), al volver la app DEBE preguntar qué hacer con ese intervalo: no contarlo (por defecto), contarlo o pausar. NUNCA DEBE sumarlo en silencio.
- **R31.** Cada debilidad de la cola de Repaso DEBE poder abrirse en una ventana de análisis que muestre: el diagnóstico (qué falla y desde cuándo), la evidencia (intentos, bloqueos y notas), las posibles causas raíz (prerrequisitos débiles), el error común del caso y un plan de mejora con pasos concretos.
- **R32.** El grafo unificado DEBE mostrar nodos de cinco tipos (concepto, challenge, etapa, test y mejora) con sus relaciones, permitir atenuar por tipo y por dominio sin ocultar nada (como R15) y abrir el detalle de cualquier nodo.
- **R27.** Las celdas del notebook cuya primera línea sea `# Datos` (no editables por el usuario) DEBEN ejecutarse antes de la celda `# Entregable - Etapa X:`; la celda entregable se ejecuta aislada del resto de celdas del usuario (R8). El proceso tiene timeout y tope de salida.
- **R33.** El orquestador DEBE persistir el progreso de cada challenge real en `challenge/challenge-NNN/progreso.json`: fecha de inicio, Apoyo vigente por etapa, Evidence, respuestas de negocio y resultados del test final. Evidence, respuestas y resultados son append-only (un `id` repetido no duplica el registro). Toda escritura DEBE ser atómica (S6) y serializada por archivo. Si `progreso.json` existe pero es ilegible o inválido, el orquestador NO DEBE sobrescribirlo: rechaza la operación con un error explícito que nombra el archivo.
- **R34.** Cada registro nuevo DEBE añadirse además, en lenguaje legible y en orden cronológico, a `challenge/challenge-NNN/logs-avance.md` (resultado, Apoyo, tiempo y su origen, bloqueo, notas, respuestas, puntaje del test). `progreso.json` es la fuente de verdad; el `.md` es solo lectura humana y se agrega (append), nunca se reescribe.
- **R35.** `configuracion-retos/knowledge-graph.json` DEBE contener el catálogo de Concepts con sus prerrequisitos. El orquestador DEBE validarlo al leerlo (ids únicos, dominio válido, prerrequisitos existentes) y, si está corrupto, reportar el error sin modificarlo. Los conceptos que practican las etapas de un challenge DEBEN existir en el catálogo.
- **R36.** La UI DEBE alimentarse del orquestador (`GET /api/state`). Con un repositorio sin historial muestra los estados vacíos de UI-UX §5. Los datos de ejemplo solo aparecen con `?datos=ejemplo`, se marcan como tales y NUNCA se persisten.
- **R37.** Si un guardado falla (el orquestador no responde o rechaza el registro), la UI DEBE revertir el cambio local, conservar lo que el usuario escribió y mostrar el error en un aviso visible; NO DEBE encolar ni reintentar en silencio.
- **R38.** Antes de invocar al Generador, el orquestador DEBE calcular un **plan de calibración** determinista (misma evidencia → mismo plan) y entregárselo con el catálogo de conceptos. El plan fija, por etapa: papel (*refuerzo*, *avance* o *integración*), dominio, `conceptIds`, Bloom, dificultad, Apoyo inicial y mecanismo. Con menos Evidence que el umbral, el plan es de *arranque* (dificultad 1, todo Guiado, solo conceptos sin prerrequisitos pendientes). El orquestador DEBE rechazar un challenge generado cuyas etapas no sigan el plan, además de R19 y R29. Los parámetros viven en `configuracion-retos/calibracion.json`.
- **R39.** La generación DEBE ser transaccional: el Generador trabaja en `challenge/.generando/challenge-NNN/` y solo se publica en `challenge/challenge-NNN/` (con un `rename`) si pasan todas las compuertas (esquema estricto R29, plan R38, dataset R24, solución de referencia R19 y conceptos existentes R35). Se divide en fases con presupuesto máximo propio (`--max-budget-usd`, configurable); si se agota, NO DEBE reintentarse sola: se informa la fase y se ofrece «Reintentar» (retoma desde la última fase válida) o «Reintentar con el doble». La salida inválida admite como máximo 2 reparaciones automáticas por fase. «Detener» borra el área de trabajo. Si el Analista falla, la Evidence ya guardada NO DEBE verse afectada y «Registrar etapa» NO DEBE bloquearse.
- **R40.** El **Nivel del usuario** DEBE calcularse por dominio, derivarse de la evidencia y no almacenarse. Escala: Trainee, Básico, Intermedio, Avanzado. Cuenta una etapa si alguno de sus intentos fue aprobado, sin ayuda y con Apoyo Autónomo, una sola vez por etapa; como la evidencia es inmutable (R10), el Nivel solo puede subir. Umbrales en el dominio: Básico con 2 etapas de dificultad ≥ 1; Intermedio con 3 de dificultad ≥ 2; Avanzado con 3 de dificultad 3. El Nivel no baja. El test final y las respuestas de negocio no cuentan. El nivel global que muestra Inicio es la mediana de los seis niveles de dominio (un dominio sin práctica es Trainee), redondeada hacia abajo. El Nivel no bloquea ningún challenge ni etapa.

---

## Fase 4 — Criterios de Aceptación

| ID | Criterio (Given/When/Then) |
|---|---|
| AC-R1 | Dado que no hay challenge activo, cuando el usuario presiona "Iniciar nuevo challenge", entonces el Generador se invoca una sola vez. |
| AC-R2 | Dado un concepto con 2 fallos en el grafo, cuando se calcula el plan, entonces incluye su refuerzo (ver AC-R38). |
| AC-R3 | Dado un challenge recién generado, cuando se inspecciona cada etapa, entonces tiene no-vacíos: Tipo, Tema, nivel Bloom, Apoyo inicial, mecanismo de evaluación. |
| AC-R4 | Dadas menos Evidence que el umbral, cuando se calcula el plan, entonces es de arranque: dificultad 1 y todo en Guiado (ver AC-R38). |
| AC-R5 | Dado un challenge con ≥2 etapas, cuando se cambia el Apoyo de una, entonces el Apoyo de las demás no cambia. |
| AC-R6 | Dado una etapa en Guiado/Pistas, cuando se registra un acierto, entonces su Nivel no incrementa. |
| AC-R7 | Dado cualquier etapa, cuando se abre el toggle de Solución, entonces el intento se marca "Con ayuda". |
| AC-R8 | Dado un notebook con `# Entregable - Etapa X:` como primera línea de una celda, cuando se presiona "Verificar etapa", entonces solo esa celda se ejecuta contra los asserts. |
| AC-R9 | Dado cualquier rol de agente y cualquier modo de evaluación, cuando se construye su invocación, entonces `Bash` figura en `--disallowedTools` y no en `--allowedTools`. |
| AC-R10 | Dado un intento fallido registrado y un reintento aprobado registrado, entonces existen dos registros Evidence distintos; y dado que se verifica varias veces sin registrar, entonces no se crea ninguno. |
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
| AC-R29 | Dado un `challenge.json` que no cumple el esquema, cuando el orquestador lo carga o verifica, entonces lo rechaza con un mensaje que nombra el campo; `challenge-001` cumple el modo estricto y los ejemplos compactos cumplen la estructura. |
| AC-R30 | Dado un cronómetro corriendo y 10 minutos sin señal, cuando la app vuelve, entonces pregunta qué hacer con el intervalo y, por defecto, no lo suma. |
| AC-R31 | Dada una debilidad por fallos, cuando se abre su análisis, entonces se ven la evidencia, las causas raíz, el error común y los pasos de mejora. |
| AC-R32 | Dado el grafo unificado recién abierto, entonces se ven nodos de los cinco tipos y los 6 dominios, y filtrar por un tipo atenúa los demás sin ocultarlos. |
| AC-R27 | Dado un notebook con celdas `# Datos` y `# Entregable - Etapa X:`, cuando se verifica, entonces se ejecutan las de datos y luego la entregable, y un exceso de tiempo termina el proceso con un error explícito. |
| AC-R33 | Dado un registro de etapa, cuando se guarda y se reinicia el orquestador, entonces la Evidence sigue en `progreso.json`; un mismo `id` enviado dos veces no la duplica; y un `progreso.json` corrupto hace fallar el guardado con un error que nombra el archivo, sin modificarlo. |
| AC-R34 | Dado un registro de etapa, una respuesta de negocio, un test o un inicio de challenge, cuando se guardan, entonces `logs-avance.md` gana una entrada legible nueva y las anteriores quedan intactas. |
| AC-R35 | Dado un `knowledge-graph.json` con un prerrequisito inexistente o JSON inválido, cuando el orquestador lo lee, entonces informa el error y el archivo no cambia; y los conceptos de las etapas de `challenge-001` existen en el catálogo. |
| AC-R36 | Dado un repositorio sin progreso, cuando se abre la app, entonces Inicio muestra el estado de usuario nuevo y no aparece la etiqueta «Datos de ejemplo»; con `?datos=ejemplo` aparece y recargar descarta lo hecho. |
| AC-R37 | Dado un guardado que falla, cuando el usuario registra una etapa, entonces el registro no aparece en el historial, lo que escribió sigue en pantalla y se muestra el error. |
| AC-R38 | (a) Dado un concepto con 2 fallos, el plan incluye su refuerzo con Apoyo Guiado y Bloom sin subir. (b) Dadas menos Evidence que el umbral, el plan es de dificultad 1 y todo Guiado. (c) El mismo estado produce siempre el mismo plan. (d) Un challenge cuyas etapas no siguen el plan se rechaza nombrando el campo incumplido. |
| AC-R39 | (a) Dado un Generador que agota el presupuesto en la fase 2, no existe ninguna carpeta nueva en `challenge/`, el error nombra la fase y «Reintentar» retoma desde ella. (b) Dada una salida con un campo inválido, se reintenta como máximo 2 veces y luego se muestra el campo. (c) Dado «Detener», el área de trabajo desaparece. (d) Dado un challenge cuya solución no reproduce `expected`, no se publica. |
| AC-R40 | (a) Dadas 2 etapas de SQL de dificultad 1 aprobadas sin ayuda en Autónomo, SQL es Básico y los demás dominios siguen en Trainee. (b) Una aprobada con Pistas o con ayuda no suma. (c) Un fallo posterior no baja el Nivel. (d) El global es la mediana de los seis dominios. |

**Deuda de diseño pendiente (solo bloquea P5):**
- Condición de disparo del Analista para crear/reforzar nodos (R12).

*Resueltas el 2026-10-14: la calibración del Generador (R2/R4 → R38), el manejo de errores y del presupuesto (R39; celda no encontrada y timeout, R26/R27; corrupción de JSON, R33/R35) y el alcance del Nivel del usuario (R40).*

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
                       configuracion-retos/  +  challenge/challenge-NNN/
```

### 6.2 Estructura de repo

```
data-scientist-skill-evaluator/
├── configuracion-retos/
│   ├── tipos-y-temas.md
│   ├── reglas-apoyo-nivel.md
│   ├── plantillas/
│   ├── usuario.json              # { "name": … }
│   └── knowledge-graph.json      # catálogo de Concepts y prerrequisitos (R35)
├── challenge/                    # todos los challenges, un subdirectorio por reto
│   ├── challenge-001/
│   │   ├── challenge.json        # fuente de verdad: metadatos, etapas, contenido, esquema, test final
│   │   ├── datos/
│   │   │   ├── seed.sql | seed.py
│   │   │   └── challenge.duckdb  # generado, ignorado por git (R24)
│   │   ├── notebook.ipynb
│   │   ├── progreso.json         # inicio, Apoyo por etapa, Evidence, respuestas y test (R33)
│   │   └── logs-avance.md        # bitácora legible, solo se agrega (R34)
│   └── challenge-002/
└── app/
```

**Regla de ubicación.** Los challenges se guardan en `challenge/challenge-NNN/` (número de al menos tres dígitos, correlativo: el siguiente es el mayor existente + 1). El `id` de un challenge real es el nombre de su carpeta (`challenge-001`) y el orquestador solo busca dentro de `challenge/`; una carpeta `challenge-NNN` fuera de ahí se ignora. *(Cambio del 2026-10-14: antes vivían en la raíz del repo.)*

### 6.3 Módulos del orquestador

| Módulo | Responsabilidad | Requisitos |
|---|---|---|
| `graph-store` | Leer, validar y escribir `knowledge-graph.json` de forma atómica; un archivo corrupto se reporta sin tocarlo | S5, S6, R35 |
| `notebook-parser` | Ubicar `# Entregable - Etapa X:` en celdas código/markdown, validar número de etapa | R8, R16 |
| `agent-runner` | Wrapper sobre `spawn('claude', ...)`, parametrizado por rol | S2–S4, R14 |
| `progress-store` | Leer y añadir (append-only, atómico y serializado) el progreso de cada challenge en `progreso.json` y su bitácora `logs-avance.md` | R10, R11, R33, R34 |
| `challenge-fs` | Leer/crear/escribir `challenge/challenge-NNN/` y construir `datos/challenge.duckdb` desde el seed | R1, R3, R18, R24 |
| `notebook-runner` | Ejecutar en un proceso con timeout las celdas `# Datos` + la entregable y comparar con `expected` | R8, R27 |
| `verify-service` | Orquestar parser → runner → agente evaluador y emitir los eventos NDJSON | R9, R14, R25, R26 |

### 6.4 Decisiones de arquitectura cerradas

1. **Comunicación frontend↔orquestador:** servidor Node local en `127.0.0.1`, levantado con `npm run app`, que abre el navegador. Frontend consume por `fetch`/NDJSON.

   **Patrón de invocación del agente (`agent-runner`), autocontenido:**
   - El servidor **no tiene API key ni habla con la API de Anthropic**: lanza el binario `claude` (Claude Code) ya instalado y autenticado en la máquina, que usa la sesión/suscripción del usuario.
   - Invocación con `spawn('claude', args)`, **sin shell**, mensaje enviado por **stdin** (nunca como argumento posicional, para evitar colisión con `--allowedTools`/escapes).
   - Flags base: `-p` (no interactivo) `--output-format stream-json --verbose` (salida JSON línea a línea) `--permission-mode dontAsk` (sin nadie para aprobar, lo no permitido se rechaza) `--max-budget-usd <n>` (tope de gasto por llamada).
   - Scope de herramientas por rol (S4): Generador y Analista → `--allowedTools Read Grep Glob` con `--disallowedTools Bash Edit Write WebFetch WebSearch Task` (solo lectura, nunca escriben directo — devuelven propuestas que el orquestador aplica). el Evaluador en ambos modos (`código_assert` y `rubric_claude`) también es de solo lectura, con `--add-dir challenge/challenge-NNN/` (R9 revisado): en `código_assert` la celda la ejecuta el `notebook-runner` del orquestador y el agente solo explica el resultado; además cada evaluación usa `--no-session-persistence` (R14).
   - `--settings` con `permissions.deny` para `.env`, `.git`, `node_modules` y cualquier carpeta fuera de `challenge/challenge-NNN/` o `configuracion-retos/`.
   - Entorno del proceso hijo: `ANTHROPIC_API_KEY: ''` (vacía explícitamente, para forzar el uso de la suscripción y no de facturación por API) y `cwd` en un directorio temporal neutro (nunca la raíz del repo, para no heredar ningún `CLAUDE.md` propio del proyecto).
   - Salida: se parsea línea a línea (`stream-json`); eventos relevantes son `assistant` (texto + `tool_use`) y `result` (`is_error`, `total_cost_usd`, `session_id`). Se reenvía al frontend como NDJSON.
   - El Generador y el Analista **nunca escriben archivos directamente** — devuelven un bloque de propuesta estructurada que el orquestador valida y aplica él mismo (mantiene control total sobre qué se escribe en `configuracion-retos/` y `challenge/challenge-NNN/`, incluso con herramientas de escritura deshabilitadas en el agente).
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
| §11.7 Nivel del usuario | Resuelto el 2026-10-14: por dominio y derivado de la evidencia (R40) |
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
4. **P3** — Generador (desbloqueado: R38–R40). *(R1–R4, R38, R39)*
5. **P4** — Evaluador código + conceptual. *(R8–R10, R16)*
6. **P5** — Analista + `graph-store` (bloqueado por R12 sin resolver). *(R11–R13, S5–S6)*
7. **P6** — Frontend: Inicio, Challenges, Challenge actual, Repaso, Analítica. *(`UI-UX.md` §§1–4, 6)*
8. **P7** — Frontend: Grafo de conocimiento con cross-domain-by-default. *(R15, `UI-UX.md` §5)*

> **Nota de orden.** P6 y P7 se construyeron antes que los agentes, sobre datos de ejemplo. Tras revisar la UI, P1 (`agent-runner`), P2 (`notebook-parser`) y una porción de P4 (verificación en vivo, R25–R27) se adelantan con un `challenge-001/` real para probar de punta a punta; P3 quedó desbloqueado el 2026-10-14 (R38–R40) y P5 sigue bloqueado por R12.

### 7.3 Deuda de diseño pendiente

- **P3 (Generador): desbloqueado el 2026-10-14.** La calibración, los errores y el Nivel del usuario se resolvieron en R38–R40 (§7.4).
- **P5 (Analista): sigue bloqueado** por la condición de disparo del Analista (R12): cuándo crea o refuerza nodos a partir de `notas_libres`. Se resolverá con evidencia real acumulada.

### 7.4 Resolución de la deuda de P3 *(aprobada por el autor el 2026-10-14; normativa en R38–R40)*

Las tres piezas que bloquean al Generador (P3). Cada una dice qué se propone, qué requisitos y criterios de aceptación nacerían de ella y qué valores concretos elegí yo y tú puedes cambiar. Al aprobarlas, pasan a la Fase 3/4 (R38–R40) y se quitan de §7.3. La condición de disparo del Analista (R12) **sigue abierta**: solo bloquea a P5 y se resolverá después, con evidencia real acumulada.

#### Propuesta A — Calibración del Generador (R2, R4)

**Idea central: el orquestador decide *qué* practicar; el Generador solo escribe *cómo* se presenta.** Antes de invocar al Generador, el orquestador calcula un *plan de calibración* con una función pura y testeable (`planChallenge`), reutilizando lo que ya existe (`computeInsights`, `buildReviewQueue`, `recommendApoyo` y el Nivel por dominio de la Propuesta C), y se lo entrega en el prompt junto con el catálogo de conceptos. Así R2 se cumple con evidencia (el plan sale del grafo y de tus intentos) y no depende de lo que el modelo «decida» mirar.

1. **Umbral de evidencia (R4).** Hay *evidencia suficiente* con **N = 8 Evidence registradas** en total (unos dos challenges). Por debajo: modo **arranque**, Nivel Básico, todas las etapas en Apoyo Guiado, dominios en rotación empezando por los menos practicados, y solo conceptos sin prerrequisitos pendientes (un prerrequisito planeado en una etapa anterior del mismo challenge cuenta como cubierto: las etapas son secuenciales).
2. **Tres etapas por challenge** (valor por defecto), cada una con un papel:
   - **Refuerzo:** el primer concepto de la cola de Repaso (misma prioridad de §8). Si un prerrequisito directo suyo también tiene fallos (causa raíz, R31), se refuerza ese prerrequisito; un prerrequisito solo «No visto» no basta, porque no hay evidencia de que sea la causa. Sin debilidades, pasa a *consolidación*: un concepto dominado hace más de 21 días.
   - **Avance:** un concepto «No visto» o «Visto» cuyos prerrequisitos estén todos al menos en «Visto» o ya vayan en una etapa anterior del mismo challenge (la frontera del grafo; las etapas son secuenciales), del dominio con menor cobertura.
   - **Integración:** una etapa de Business Analytics que interpreta el resultado de las anteriores (como la etapa 2 de `challenge-001`).
   Empates: por prioridad descendente y luego por id, para que el plan sea reproducible. Las etapas técnicas son del mismo dominio que el ancla (refuerzo o consolidación) para que el challenge tenga un solo dataset coherente; si ese dominio no tiene más conceptos en la frontera, se toma el siguiente dominio técnico. El plan se puede consultar con `GET /api/plan?dominio=` (solo lectura).
3. **Dificultad.** La dificultad de cada etapa es el Nivel del usuario en su dominio + 1, con tope 3 (Trainee = 0, Básico = 1, Intermedio = 2, Avanzado = 3; Trainee practica dificultad 1 y un Avanzado sigue en 3); en *arranque* es 1. La del challenge es la mayor de sus etapas.
4. **Bloom.** El objetivo es el Bloom más alto aprobado sin ayuda en ese concepto + 1 (tope 6; sin historial, 3). Si el concepto tiene 2 o más fallos, se mantiene el Bloom del fallo (no se sube mientras no se aprueba). La etapa de integración es de Bloom 4 o más (Analizar). En modo arranque, 3 (y 4 la de integración).
5. **Apoyo inicial.** `recommendApoyo` de §8: ≥2 fallos → Guiado; 1 fallo, parcial o con ayuda → Pistas; olvido o dominado → Autónomo; «Visto» → Pistas; «No visto» → Guiado. Coherente con R6.
6. **Mecanismo.** `código_assert` si el dominio es SQL, Python, Limpieza o ML y el resultado se puede comparar; `rubric_claude` en Matemática y Business.
7. **Tema y datos.** El Generador elige el escenario de negocio, pero no puede repetir el dataset ni el sector de los últimos 3 challenges.
8. **El plan es un contrato.** El orquestador rechaza el challenge generado si no cumple el plan (los `conceptIds`, dominio, Bloom, Apoyo y mecanismo de cada etapa). Esto se suma a R29 y R19.
9. **Elección manual opcional.** «Iniciar nuevo challenge» puede recibir un dominio; por defecto es «Recomendado por mi grafo». No cambia el resto del plan.

*Requisito:* **R38** (plan de calibración calculado por el orquestador y cumplido por el challenge) y la revisión de **R4** (umbral N = 8, modo arranque).
*Criterios:* AC-R38a «dado un concepto con 2 fallos, el plan incluye su refuerzo con Apoyo Guiado y Bloom sin subir»; AC-R38b «dadas menos de 8 Evidence, el plan es de dificultad 1 y todo en Guiado»; AC-R38c «el mismo estado produce siempre el mismo plan»; AC-R38d «un challenge cuyas etapas no siguen el plan se rechaza con el campo incumplido».
*Valores configurables:* N = 8, 3 etapas, 21 días de olvido, ventana de 3 challenges para no repetir tema.

#### Propuesta B — Fallos y presupuesto de la generación (§7.3 «manejo de errores»)

**Idea central: generar es transaccional.** Nada llega a `challenge/` hasta que todo está validado.

1. **Área de trabajo.** El Generador trabaja en `challenge/.generando/challenge-NNN/` (ignorada por git). Solo cuando pasan todas las compuertas el orquestador la mueve de un `rename` a `challenge/challenge-NNN/`. Las compuertas son: esquema estricto (R29), el plan (Propuesta A), el dataset se construye (R24), la solución de referencia reproduce `expected` (R19) y los conceptos existen en el catálogo (R35). Si algo falla, no queda nada a medias en `challenge/`.
2. **Fases con puntos de retorno.** Fase 1: esqueleto (objetivos, escenario, diseño de datos, esquema de las etapas). Fase 2: el contenido de cada etapa, una por una. Cada fase se valida y se guarda en `estado.json` dentro del área de trabajo.
3. **Presupuesto agotado (`--max-budget-usd`).** Tope inicial: **US$ 1,50 por fase** (`calibracion.json`). Si se agota, el agente se detiene, **no se reintenta solo** (R1: todo es acción tuya) y la UI muestra: «Se agotó el presupuesto en la fase X. No se creó ningún challenge.» con dos botones: **Reintentar** (retoma desde la última fase válida, sin repetir lo ya pagado) y **Reintentar con el doble de presupuesto**. Lo ya validado se conserva hasta 24 h.
4. **Salida inválida (JSON roto o esquema incumplido).** Hasta **2 reparaciones automáticas por fase**: se devuelven al Generador los errores del validador (con el campo) dentro de la misma operación que tú iniciaste. Al tercer fallo se detiene y se muestran los errores. Las reparaciones cuentan para el presupuesto.
5. **Cancelar.** «Detener» aborta el proceso (como en R26) y borra el área de trabajo.
6. **Antes de empezar.** Si `claude` no está instalado o no tiene sesión, falla de inmediato con el mensaje de P1; no se crea nada.
7. **`knowledge-graph.json` corrupto (ya cubierto por R35).** Para el Analista (P5) se añade: antes de cada escritura se copia el archivo actual a `knowledge-graph.json.prev` (ya ignorado por `.gitignore`) y se valida el nuevo contenido antes de reemplazar. Si el Analista falla o se queda sin presupuesto, **la Evidence ya está guardada** (R33) y el grafo no cambia: la UI muestra un aviso y la evidencia queda pendiente de análisis, nunca bloquea «Registrar etapa».

*Requisito:* **R39** (generación transaccional, presupuesto por fase, reparaciones acotadas, sin reintento automático de presupuesto).
*Criterios:* AC-R39a «dado un Generador que agota el presupuesto en la fase 2, entonces no existe ninguna carpeta nueva en `challenge/`, el error nombra la fase y "Reintentar" retoma desde la fase 2»; AC-R39b «dada una salida con un campo inválido, entonces se reintenta como máximo 2 veces y luego se muestra el campo»; AC-R39c «dado "Detener", entonces el área de trabajo desaparece»; AC-R39d «dado un challenge cuya solución no reproduce `expected`, entonces no se publica» (refuerza AC-R19).
*Valores configurables:* US$ 1,50 por fase (provisional: se fijará en ≈ el doble del costo medido en una generación real), 2 reparaciones, 24 h de conservación.

#### Propuesta C — Alcance del «Nivel del usuario» (§9.7 del PRD)

**Idea central: el Nivel es por dominio (Tipo), se deriva de la evidencia y nunca se almacena.** Es lo que ya decían la Épica («Apoyo/Nivel por Tipo») y R6 («una etapa en Guiado o Pistas no sube su Nivel»); un nivel global único escondería que puedes ser Avanzado en SQL y Trainee en ML.

1. **Escala.** Trainee → Básico → Intermedio → Avanzado, **por cada uno de los 6 dominios**.
2. **Qué cuenta para subir.** Una etapa cuenta si **alguno de sus intentos** fue *aprobado, sin ayuda y con Apoyo Autónomo* (así R6 se cumple por construcción). Los reintentos no inflan: cada etapa cuenta una vez. *(Se usa «alguno» y no «el último» a propósito: con el último intento, un fallo posterior en la misma etapa quitaría nivel, y el punto 4 dice que no baja.)*
3. **Umbrales** (etapas que cuentan, en ese dominio): Trainee → Básico: **2** de dificultad ≥ 1. Básico → Intermedio: **3** de dificultad ≥ 2. Intermedio → Avanzado: **3** de dificultad 3.
4. **No baja.** Un fallo posterior no quita nivel (HU8: no se penaliza para siempre). Lo que muestra la debilidad es Repaso y el estado del concepto, no el Nivel.
5. **Qué no cuenta.** El test final (mide recuerdo, Bloom 1–3, ya alimenta el estado del concepto por R23), las respuestas de negocio y las etapas con ayuda.
6. **Nivel global (solo para mostrar en Inicio).** La **mediana** de los seis niveles de dominio (un dominio sin practicar vale Trainee), redondeada hacia abajo: pide amplitud, no solo un dominio fuerte. Analítica muestra los seis.
7. **Para qué sirve.** (a) Calibra la dificultad del Generador (Propuesta A, «Nivel + 1»); (b) se muestra en Inicio y Analítica. **No bloquea nada**: ningún challenge ni etapa se cierra por tu nivel.
8. **Cambio de código.** `stats.ts` pasa de un único cálculo global a `levelByDomain(...)` + `globalLevel(...)`; Inicio muestra el global y Analítica los seis. Nada se guarda en `progreso.json`: se deriva, como el estado de las etapas.

*Requisito:* **R40** (Nivel por dominio derivado de la evidencia con las reglas anteriores).
*Criterios:* AC-R40a «dadas 2 etapas de SQL de dificultad 1 aprobadas sin ayuda en Autónomo, entonces SQL es Básico y los demás dominios siguen en Trainee»; AC-R40b «una aprobada con Pistas o con ayuda no suma»; AC-R40c «un fallo posterior no baja el Nivel»; AC-R40d «el global es la mediana de los seis».
*Decisiones fijadas en R40:* umbrales 2/3/3, mediana como global, el test no cuenta.

#### Orden de implementación
C primero (es una función pura sobre lo que ya hay y la usa A), luego A (`planChallenge`, con sus tests, antes de invocar a ningún agente), luego B y el Generador (P3) completo sobre `agent-runner`. Cada paso va con sus AC como tests y un commit.

---

## Fase 8 — Decisiones y supuestos de la UI con datos de ejemplo

La UI se construyó antes que los agentes (P6/P7 adelantados) sobre datos sintéticos, detrás de `app/web/src/data/repository.ts`. El PRD de referencia (§11 fórmulas, §25–26 datos) no está en el repo. Las fórmulas siguientes fueron **ratificadas por el autor el 2026-10-14** (el «Nivel del usuario» se decidió después, R40) y se pueden ajustar más adelante:

- **Estado de Concept** (`domain/conceptState.ts`): sin intentos → No visto; algún último intento fallido → Con fallos; todos aprobados sin ayuda → Dominado; cualquier otro caso (parcial o con ayuda) → Visto. Sigue R11 (solo el último intento de cada etapa).
- **Prioridad de la cola de repaso** (`domain/reviewQueue.ts`): base por motivo (fallos 100, parcial 70, ayuda 60, olvido 40) + 5 × fallos históricos de la etapa + 2 × conceptos dependientes + 0.3 × días desde la práctica. «Olvido» = dominado hace más de 21 días.
- **Nivel del usuario** (`domain/level.ts`): por dominio, según R40 (sustituye al cálculo global provisional).
- **Meta semanal** de 5 etapas para el subtítulo de Inicio.
- **Estado de Etapa y de Challenge se derivan** de la evidencia; no se almacenan.
- **R10 resuelta (2026-10-14).** La Evidence se crea al **registrar** la etapa; verificar es un borrador. R10 se reescribió en ese sentido.
- **Layout del grafo**: un carril horizontal por dominio (R15: los 6 dominios visibles al abrir), capas de izquierda a derecha por camino más largo de prerrequisitos. Con ~240 conceptos, pan/zoom sostiene ~13 ms por frame.

### 8.1 Cambios tras la primera revisión de la UI

- **Contenido rico (R17–R19, R24).** Los enunciados de una línea eran insuficientes. El formato sale de las plantillas del Notion del autor (Plantilla · SQL/Python/Business Analytics): escenario → datos → teoría aplicada → ejemplo resuelto en otro dominio → paso a paso → esqueleto → entregable verificable → preguntas de negocio → solución por secciones. La solución incluye "cómo se conectan los conceptos", "error común", "conexión con el flujo de DS" y "habilidad que entrena".
- **Datos sintéticos (HU20, R18–R19, R24).** El Generador diseña tablas pequeñas a mano (8–20 filas) para que la tabla esperada sea verificable, o un `seed.py` con semilla fija cuando hace falta volumen; ejecuta la solución de referencia para obtener `expected`. Motor: **DuckDB** (sintaxis cercana a PostgreSQL, sin servidor). El `.venv` del proyecto no trae paquetes: `requirements.txt` lista los necesarios.
- **Cronómetro (R20, R30).** *(Sustituido en 8.2: es un único cronómetro global con vueltas.)* Se mide en el navegador con marcas de tiempo (no se desvía si la pestaña se throttlea), persiste en `localStorage` y se sincroniza entre pestañas; más adelante el orquestador lo registrará en `logs-avance.md`.
- **Verificación en vivo (R25–R27, HU16).** Panel bajo el botón con línea de tiempo y feedback. La ejecución de la celda es del orquestador, no de un agente (R9 revisado).
- **Columna "Entrega" retirada.** Pegar/Subir/Enlace no encaja con el flujo (el usuario resuelve en su notebook de VS Code, HU5). La columna lateral pasa a "Registro de la etapa": cronómetro, "¿Dónde te trabaste?", notas y registrar.
- **Test final (R21, R23).** Cuenta como evidencia de Bloom 1–3, así que el nivel "Recordar/Comprender", vacío hasta ahora, empieza a tener datos.
- **Implementado en el adelanto de P1/P2/P4.** `agent-runner`, `notebook-parser`/`notebook-runner` y `verify-service` existen y están probados con un `claude` falso y con DuckDB real (`challenge-001`). Quedan fuera: Generador (P3) y Analista (P5), y registrar el cronómetro y las respuestas en `logs-avance.md`.
- **Veredicto.** En etapas de código lo decide el orquestador (ejecución + comparación con `expected`/asserts); el Evaluador solo redacta el feedback y no puede cambiarlo. En etapas conceptuales el Evaluador aplica la rúbrica y termina con `VEREDICTO: correcta|parcial|incorrecta`; si no lo indica, cuenta como parcial.
- **Convención de la celda SQL.** La celda entregable asigna el resultado a la variable `resultado` (relación de DuckDB, DataFrame o lista de diccionarios); el orquestador la serializa y la compara con `expected` (mismas columnas sin distinguir mayúsculas, mismas filas en el mismo orden). Por eso el entregable exige el `ROUND` del enunciado.
- **Respuestas conceptuales en el notebook.** En los challenges reales la respuesta de una etapa conceptual se escribe en la celda markdown `# Entregable - Etapa N:` (como define §6.4.3); la UI ya no ofrece un cuadro de texto para esos casos.
- **Contenido Markdown.** Los signos de moneda se escapan como `\$` para que KaTeX no los lea como fórmula.

### 8.2 Cambios tras la segunda revisión de la UI

- **Cronómetro global con vueltas (R20, R30).** Un solo reloj para todo el trabajo; «Registrar etapa» toma una *vuelta*: el tiempo desde el último registro. Así Analítica conserva el tiempo por etapa. Como el usuario resuelve en VS Code, la app NO se pausa cuando la pestaña pierde el foco; el reloj corre por marcas de tiempo. Si la app desaparece (pestaña cerrada, equipo suspendido) y vuelve tras más de 3 minutos, pregunta qué hacer con ese intervalo; lo no contado por defecto es el intervalo ausente.
- **Objetivos del reto (R28).** Cada challenge dice qué busca, qué obtendrás y qué habilidades entrena. Es parte del contrato del Generador.
- **Formato como contrato para los agentes (R29).** `challenge.schema.json` (JSON Schema) y las plantillas por Tipo en `configuracion-retos/plantillas/` fijan cómo se presenta un caso: escenario → objetivos → datos → etapas (teoría, ejemplo, paso a paso, esqueleto, entregable, solución) → preguntas de negocio → test final. El Generador los lee y el orquestador valida su salida.
- **Ventana de debilidad (R31)** y **grafo unificado (R32)** salen de la UI; el análisis de debilidad es determinista (deriva de la evidencia) y puede enriquecerse más adelante con el Analista.
- **Presentación.** Texto justificado, columna de lectura centrada, tablas centradas y sin anillos alrededor de cuadrículas; la etapa desplegada se enfatiza con un sombreado gradual, no con un borde.
- **Dos modos de validación (R29).** El orquestador valida los challenges reales en **modo estricto**: además de la estructura exige el contenido completo del Generador (todas las capas de ayuda, test final, ≥ 3 preguntas de negocio, `expected` o `asserts` en las etapas de código). Los ejemplos compactos solo cumplen la **estructura**. Un challenge rechazado no se carga y su causa se muestra al verificar y en `GET /api/challenges` (`invalid`).
- **Contrato para los agentes.** `configuracion-retos/plantillas/` contiene `challenge.schema.json`, `contrato-generador.md` y una plantilla por tipo de reto (SQL, Python/Limpieza, Matemática, ML, Business). Es lo que el Generador (P3) lee antes de producir.

### 8.3 Persistencia real (tras ratificar R10 y las fórmulas)

- **Qué se guarda y dónde (R33–R35).** El progreso de cada challenge real vive en `challenge/challenge-NNN/progreso.json` (fuente de verdad, versionada por git) y se refleja en `logs-avance.md` (bitácora legible). El catálogo de Concepts vive en `configuracion-retos/knowledge-graph.json`, que se sembró con los conceptos del grafo de ejemplo (sin la clave `edges`: los prerrequisitos ya están en cada concepto y las aristas se derivan). El nombre del usuario, en `configuracion-retos/usuario.json`.
- **Un solo endpoint de lectura.** `GET /api/state` devuelve usuario, conceptos, challenges (y los inválidos con su causa) y todo el progreso. Las escrituras son `POST /api/challenges/:id/{start|evidence|business-answers|test-results}` y `PUT /api/challenges/:id/stages/:stageId/apoyo`. El cliente genera el `id` y la fecha de cada registro (así el guardado es idempotente y la UI puede mostrarlo al instante); el servidor valida la forma, que la etapa pertenezca al challenge y que el `id` no esté repetido.
- **Serialización de escrituras.** Cada `progreso.json` tiene su propia cola: lee, modifica y escribe de forma atómica, una operación a la vez. Es distinta del mutex de las operaciones de agente (que rechaza la segunda), porque estas escrituras son breves y no deben perderse ni rechazarse.
- **Lo que sigue en el navegador.** El cronómetro en marcha (`dsc-timer`) y los borradores de respuestas sin guardar; su resultado, el tiempo de la etapa, queda en la Evidence al registrar. No se guarda un historial de pausas.
- **Modo ejemplo.** `?datos=ejemplo` carga los datos sintéticos de siempre (más los challenges reales), todo en memoria; no escribe nada. Sin ese parámetro la app arranca vacía salvo lo que haya en los archivos.
- **Fallos (R37).** Se hace el cambio al instante y, si el guardado falla, se revierte, se conserva lo escrito y se muestra el aviso.
- **Sigue abierto.** Solo la condición de disparo del Analista (R12), que bloquea a P5. La calibración del Generador, el manejo de errores y el Nivel del usuario se resolvieron el 2026-10-14 (R38–R40).
