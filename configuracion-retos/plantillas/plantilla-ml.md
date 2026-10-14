# Plantilla · Machine Learning

**Dominio:** `ml` · **Mecanismos:** `codigo_assert` para *aplicar* (entrenar, evaluar, ingeniería de variables) y
`rubric_claude` para *explicar* un algoritmo o justificar una decisión.

## Algoritmos — explicar (`rubric_claude`)
- `description`: «Explica con tus palabras el algoritmo X a alguien que sabe programar pero nunca lo usó».
- `deliverables`: (1) qué problema resuelve y qué entra/sale, (2) intuición, (3) cómo «aprende» (si no ajusta parámetros,
  decirlo), (4) hiperparámetros y su efecto en sesgo/varianza, (5) cuándo falla, (6) cómo se evalúa y se elige k o λ.
- Incluye una **pregunta de control** que obligue a razonar (p. ej. qué pasa con k = 1 y con k = n).
- `solution`: explicación de referencia por secciones y «puntos que suelen omitirse».

## Algoritmos — aplicar (`codigo_assert`)
- Datos con **semilla fija** y tamaño pequeño; el entregable es una función o un DataFrame verificable por asserts.
- Etapas habituales: preparar variables sin fuga de datos → entrenar → evaluar con la métrica correcta → justificar el
  umbral o la elección del modelo.
- `theory` con la fórmula de la métrica; `commonError` con el error típico (evaluar en entrenamiento, escalar antes de
  dividir, ignorar el desbalance).
