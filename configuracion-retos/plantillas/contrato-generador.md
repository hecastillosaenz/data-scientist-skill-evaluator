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

## 4. Verificación obligatoria antes de entregar (R19)

1. Ejecuta el `seed` en DuckDB y comprueba que corre sin error y que `rowCount` y `sampleRows` coinciden.
2. Ejecuta la **solución de referencia** sobre esos datos y guarda su salida literal como `expected`. Si no coincide con
   lo que el enunciado promete, **rechaza el challenge**.
3. Ejecuta también las versiones erróneas que citas en `commonError` y comprueba los números que afirmas.
4. Comprueba cada respuesta numérica del test final calculándola, no de memoria.
5. Valida el JSON contra `challenge.schema.json`. **[verifica]**

## 5. Datos sintéticos (R18, R24)

- Tablas **pequeñas y diseñadas a mano** (8–20 filas) para que la tabla esperada sea verificable y las trampas (fan-out,
  NULL, duplicados) estén presentes a propósito. Desde Nivel Intermedio, con imperfecciones.
- `data.seedSql` es el contenido de `datos/seed.sql` (DuckDB/PostgreSQL). Solo usa `seedPython` (semilla fija) si de
  verdad hace falta volumen.
- El orquestador reconstruye `datos/challenge.duckdb` desde el seed y el notebook la abre con `read_only=True`.

## 6. Qué NO hacer

- No incluyas estilos, HTML ni emojis: la UI se ocupa de la presentación.
- No inventes campos fuera del esquema: se rechazan.
- No ejecutes código fuera del paso de verificación del orquestador: los agentes son de solo lectura (R9).
- No reveles la solución en `hints`, `steps` ni en el enunciado.
