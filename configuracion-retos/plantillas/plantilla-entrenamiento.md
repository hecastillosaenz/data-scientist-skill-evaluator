# Plantilla · Model Training

**Dominio:** `training` · **Mecanismos:** `codigo_assert` para *entrenar y validar* y `rubric_claude` para *diagnosticar*
y *decidir* (qué modelo, qué métrica, cuándo parar).

## Entrenar y validar (`codigo_assert`)
- Datos sintéticos con **semilla fija**, ya con variables listas. El entregable es una función (`entrenar(X, y)`,
  `evaluar(modelo, X, y)`) o un diccionario de métricas verificable por asserts con tolerancia.
- Etapas habituales: modelo base y métrica de referencia → validación adecuada al problema (estratificada, por grupos,
  temporal) → búsqueda de hiperparámetros dentro de la validación → comparación final en el conjunto de prueba **una sola vez**.
- `commonError`: elegir hiperparámetros mirando el conjunto de prueba, validación aleatoria en series de tiempo,
  reportar solo accuracy con clases desbalanceadas, no fijar la semilla.

## Diagnosticar y decidir (`rubric_claude`)
- `deliverables`: (1) qué muestran las curvas (sobreajuste, subajuste o ruido), (2) qué cambio probar primero y por qué,
  (3) qué métrica refleja el costo real del negocio, (4) qué evidencia haría cambiar de modelo.
- Incluye una **pregunta de control**: «si el modelo mejora 2 puntos en validación, ¿cómo sabes que no es suerte?».

## Claridad
Muestra primero qué *hace* el entrenamiento con un ejemplo mínimo (3–5 puntos, una iteración a mano) y después el nombre
técnico del procedimiento.
