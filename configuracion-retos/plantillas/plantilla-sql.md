# Plantilla · SQL

**Dominio:** `sql` · **Mecanismo:** `codigo_assert` (la celda guarda el resultado en `resultado`) · **Motor:** DuckDB.
Basada en la plantilla «SQL» del Notion del autor; sigue el orden de `contrato-generador.md`.

## Qué debe contener el challenge

- **Escenario** (`scenario`): analista de datos en una organización concreta; la decisión que informa el resultado; la
  métrica con su fórmula en LaTeX si la hay.
- **Datos** (`data.seedSql`): `CREATE TABLE` + `INSERT`, con PK/FK declaradas. Desde Intermedio, nulos y duplicados.
- **Tema** típico: joins, CTEs y agregaciones, funciones de ventana, fechas, deduplicación, cohortes.

## Qué debe contener cada etapa

| Campo | Contenido |
|---|---|
| `description` | Una única consulta, con columnas, alias, orden y redondeo exactos. |
| `theory` | Granularidad, fan-out, CTE, tipo de JOIN, NULL/COALESCE… lo que el reto necesita, con por qué importa aquí. |
| `workedExample` | Otro dominio; incluye `CREATE TABLE` + `INSERT` + la consulta resuelta + su resultado **ejecutado**. |
| `steps` | Identificar el grano → pre-agregar → unir → agrupar → calcular → ordenar → comparar con la tabla esperada. |
| `hints` | Preguntas que orientan sin dar el JOIN ni la fórmula. |
| `skeleton` | `language: "sql"` con `TODO` en cada cláusula. |
| `deliverables` | Una consulta, columnas exactas, restricciones (qué no usar), interpretación de negocio, terminado cuando… |
| `expected` | La salida **ejecutada** de la solución de referencia. |
| `solution.commonError` | Las versiones erróneas con sus números (p. ej. el JOIN directo que duplica primas). |

## Celda del notebook

```python
# Entregable - Etapa 1:
resultado = con.sql("""
SELECT ...
""")
```
El orquestador serializa `resultado` (relación DuckDB, DataFrame o lista de dicts) y la compara con `expected`: mismas
columnas (sin distinguir mayúsculas), mismas filas y en el mismo orden.
