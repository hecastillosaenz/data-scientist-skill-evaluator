# Contrato del Generador

Todo challenge que el Generador produzca DEBE cumplir `challenge.schema.json` y este documento. Las reglas con
**[verifica]** las comprueba el orquestador; las demás las revisa el autor.

## 1. Orden de presentación (lo que ve el usuario)

1. **Objetivos del reto** (`objectives`): qué busca (`lookingFor`, empieza con «Que …»), qué tendrá al terminar
   (`outcomes`, 2–5 resultados concretos y verificables) y qué habilidades entrena (`skills`). **[verifica]**
2. **Enunciado** (`scenario` + `task`): escenario de negocio en 2–4 líneas (rol, organización, decisión que informa el
   resultado) y después la pregunta analítica concreta. Si hay una métrica, defínela con su fórmula.
3. **Datos** (`data`): tablas con llaves PK/FK, filas de muestra y el seed. El diagrama relacional y la vista previa se
   dibujan solos desde esta estructura. **[verifica]** llaves foráneas y anchos de fila.
4. **Etapas** (`stages`, numeradas 1, 2, 3… y con id `<challenge.id>-s<n>`): cada una con su contenido de estudio.
5. **Preguntas de negocio** (`businessQuestions`): Básico 3, Intermedio 4, Avanzado 5; específicas al caso, con guía de
   reflexión (`reflectionGuide`) que se muestra solo después de que el usuario responda.
6. **Test final** (`finalTest`): 5–8 preguntas aplicadas, cada una atada a un concepto que practican las etapas.

## 2. Capas de ayuda de cada etapa

El Generador produce **todas** las capas; la UI muestra las que corresponden al Apoyo vigente (el usuario lo cambia por
etapa). Leer teoría, ejemplo o pasos **no** cuenta como «Con ayuda»; solo abrir la solución lo hace.

| Apoyo | Campos que se muestran |
|---|---|
| **Guiado** | `theory` (3–5 ideas con fórmulas) · `workedExample` (otro dominio, datos distintos, resultado verificado) · `steps` (4–7 pasos) · `skeleton` (con `TODO`) |
| **Pistas** | `hints` (qué mirar y en qué orden; **sin** dar la fórmula final ni el enfoque correcto) · `research` |
| **Autónomo** | solo `research` y `deliverables` |
| Siempre | `deliverables` (checklist verificable), `expected` o `asserts`, `solution` (por secciones) |

Secciones de `solution`: `code`, `expectedResult`, `reasoning`, `conceptLinks` (qué concepto se usa en qué paso),
`businessInterpretation` (incluye una limitación), `commonError` (con los números que da el error), `dsFlow` (en qué
momento del trabajo real aparece) y `skill`.

## 3. Reglas de contenido

- **Todo en español.** Datos y nombres de columnas pueden ir en español (`polizas`, `monto_pagado`).
- **El ejemplo resuelto va en otro dominio** y con otros datos; nunca resuelve el reto.
- **Conceptos para investigar** (`research`, 3–4): del más básico al más cercano al problema; cada uno con búsqueda en
  español e inglés y una frase de por qué importa. Los `conceptId` deben existir en el grafo y figurar en `conceptIds`.
  **[verifica]**
- **Entregable verificable:** qué se entrega (columnas exactas, alias, orden, redondeo), criterio (tabla esperada o
  asserts), restricciones, interpretación de negocio y «Terminado cuando…».
- **Tiempo objetivo** 20–30 min por etapa (`estimatedMinutes`). Investigar y leer no cuentan en el tiempo real.
- **Nivel cognitivo (Bloom)** por etapa: 1 Recordar … 6 Crear. Distribuye; no todo en B3.
- **Mecanismo:** `codigo_assert` si se verifica ejecutando una celda; `rubric_claude` si es una respuesta que se evalúa
  con rúbrica (matemática de desarrollo, explicar un algoritmo, casos de negocio).

## 4. Verificación obligatoria (R19, R24) — la hace el orquestador

El Generador es de solo lectura y **no ejecuta código** (R9). El orquestador ejecuta, en cada fase, lo que antes se pedía
«ejecutar», y rechaza lo que no coincide:

1. **Seed:** construye `datos/challenge.duckdb` desde `data.seedSql`; si no corre, devuelve el error de DuckDB. Comprueba
   que `rowCount`, las columnas, `sampleRows` y las llaves foráneas coinciden con lo que declaras.
2. **Solución de referencia:** ejecuta `solution.code` sobre esos datos. Debe correr sin error y reproducir `expected`
   (mismas columnas y filas, en el mismo orden) o pasar los `asserts`. Si no, la fase se repara con la salida real.
3. **Plan:** el orquestador fija id, número, dificultad y, por etapa, dominio, Bloom, dificultad, Apoyo y mecanismo (R38);
   tú aportas el contenido y, si quieres, hasta 3 conceptos de apoyo por etapa (ids exactos del grafo).
4. **Esquema y contenido estricto** (R29): todas las capas de ayuda, test final y preguntas de negocio.

Por eso **calcula con cuidado** `expected`, las respuestas numéricas del test y los números que cites en `commonError`:
el orquestador compara la ejecución con `expected`, pero no puede comprobar un número escrito en prosa.

La generación va por fases (esqueleto → una etapa por llamada → test final) y cada fase admite hasta 2 reparaciones
(R39). Responde en cada fase con un único bloque ```json con la forma que se te pide en el mensaje.

## 5. Datos sintéticos (R18, R24)

- Tablas **pequeñas y diseñadas a mano** (8–20 filas) para que la tabla esperada sea verificable y las trampas (fan-out,
  NULL, duplicados) estén presentes a propósito. Desde Nivel Intermedio, con imperfecciones.
- `data.seedSql` es el contenido de `datos/seed.sql` (DuckDB/PostgreSQL). **El Generador solo produce datasets DuckDB con
  `seedSql`** (también para las etapas de Python, que leen con `con.sql(...).df()`); `seedPython` queda reservado para más adelante.
- El orquestador reconstruye `datos/challenge.duckdb` desde el seed y el notebook la abre con `read_only=True`.

## 6. Qué NO hacer

- No incluyas estilos, HTML ni emojis: la UI se ocupa de la presentación.
- No inventes campos fuera del esquema: se rechazan.
- No ejecutes código: los agentes son de solo lectura (R9).
- No reveles la solución en `hints`, `steps` ni en el enunciado.
