# Plantillas y contrato de los challenges

Esta carpeta es **el formato de presentación de un caso, guardado para los agentes** (SDD R29). El Generador la lee antes
de producir un challenge y el orquestador valida su salida contra `challenge.schema.json`; si no cumple, la rechaza con
un mensaje explícito.

| Archivo | Para qué sirve |
|---|---|
| `challenge.schema.json` | Estructura exacta de `challenge-N/challenge.json` (JSON Schema). Es la fuente de verdad del formato. |
| `contrato-generador.md` | Reglas de producción: orden de presentación, capas por Apoyo, conteos por nivel, verificación obligatoria. |
| `plantilla-sql.md` | Retos de **SQL** (datos con `CREATE TABLE` + `INSERT`, tabla esperada, CTE/joins/ventanas). |
| `plantilla-python.md` | Retos de **Python** y **Limpieza y Visualización** (datos reproducibles, asserts). |
| `plantilla-matematica.md` | Retos de **Matemática Aplicada** (teoría con fórmulas, desarrollo paso a paso). |
| `plantilla-ml.md` | Retos de **Machine Learning** (algoritmos: explicar y aplicar). |
| `plantilla-business.md` | Retos de **Business Analytics** (KPI y caso analítico). |

Los textos son Markdown con fórmulas LaTeX (`$…$`, `$$…$$`). **Escapa los signos de moneda como `\$`** para que no se
lean como fórmula. La presentación (texto justificado, columna centrada, tablas centradas) la resuelve la UI: el agente
solo entrega contenido, nunca estilos.
