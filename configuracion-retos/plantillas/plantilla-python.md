# Plantilla · Python y Limpieza y Visualización

**Dominios:** `python`, `cleaning` · **Mecanismo:** `codigo_assert` (asserts sobre una función o un DataFrame).

## Qué debe contener el challenge

- **Escenario** con rol, organización y decisión.
- **Datos** reproducibles y completos: valores explícitos o generación con **semilla fija**; desde Intermedio, con
  imperfecciones (nulos, duplicados, tipos mezclados). Si hay tablas, decláralas en `data.tables` (columnas y filas de
  muestra) para que la UI muestre el esquema.

## Qué debe contener cada etapa

| Campo | Contenido |
|---|---|
| `description` | Firma exacta `def nombre(args) -> tipo`, qué devuelve, formato y redondeo. |
| `theory` | Los conceptos de pandas/NumPy/estadística necesarios; para visualización, qué gráfico elegir y por qué. |
| `workedExample` | Otro dominio, con el código y el resultado ejecutado. |
| `steps` / `hints` | Paso a paso (Guiado) y pistas sin la solución (Pistas). |
| `skeleton` | `language: "python"` con la firma y `TODO`. |
| `asserts` | Casos de prueba que ejecuta el orquestador tras la celda del usuario. Compara flotantes con `round` o `math.isclose`. |
| `deliverables` | Firma, criterio (los asserts pasan), restricciones (librerías, iterar fila por fila), interpretación y terminado cuando… |
| `solution` | Código ejecutado antes de publicar; complejidad o alternativa en `reasoning`. |

## Visualización
El entregable describe el gráfico (tipo, ejes, título que **concluye**) y los asserts comprueban datos y títulos, no
píxeles. En `solution.commonError` incluye el gráfico engañoso típico.
