# Plantilla · Feature Engineering

**Dominio:** `features` · **Mecanismos:** `codigo_assert` para *construir* variables y `rubric_claude` para *justificar*
qué variable crear, cuál descartar y por qué no hay fuga.

## Construir variables (`codigo_assert`)
- Datos pequeños con **semilla fija** y una columna objetivo clara. El entregable es una función `construir_features(df)`
  o un DataFrame con columnas exactas, verificable por asserts (nombres, tipos, valores de filas concretas).
- Etapas habituales: transformar y codificar → crear agregaciones, ventanas o interacciones → seleccionar → comprobar que
  nada de la variable usa información del futuro ni del objetivo.
- Cada variable nueva debe responder una pregunta de negocio: «¿qué señal del mundo real intenta capturar?».
- `commonError`: ajustar el codificador o el escalador con **todo** el dataset antes de dividir (fuga), agregar con
  información posterior a la fecha de predicción, codificar con el objetivo sin validación cruzada interna.

## Justificar decisiones (`rubric_claude`)
- `deliverables`: (1) qué señal captura la variable, (2) por qué ayuda a ESTE modelo (lineal, árbol…), (3) cómo se calcula
  en producción con los datos disponibles al predecir, (4) qué fuga podría esconder, (5) cómo se comprobaría su aporte.
- Incluye una **pregunta de control**: «¿esta variable existiría en el momento real de predecir?».

## Claridad
Antes de la fórmula, un caso de 4–6 filas donde se vea la variable **antes y después** de transformarla.
