# Plantilla · Matemática Aplicada

**Dominio:** `math` · **Mecanismo:** normalmente `rubric_claude` (desarrollo escrito); opcionalmente una etapa de código
que verifica el cálculo.

## Qué debe contener el challenge

- **Escenario** con datos numéricos explícitos y una notación definida (`$F$`, `$A$`, `$\bar{F}$`…). Una tabla de datos en
  `task` (Markdown) es bienvenida: la UI la centra.
- Una pregunta con **varias partes** (a, b, c) que lleve del cálculo a la interpretación («por qué sorprende y qué lo
  causa»).

## Qué debe contener cada etapa

| Campo | Contenido |
|---|---|
| `theory` | Cada concepto numerado con su fórmula en `$$…$$` y la **trampa** típica (p. ej. confundir $P(A\mid F)$ con $P(F\mid A)$). |
| `workedExample` | Otro dominio con el cálculo completo y su resultado verificado numéricamente. |
| `steps` | Datos → fórmula → sustitución → resultado → comparación → interpretación. |
| `hints` | Preguntas intuitivas (p. ej. «de cada 1 000 correos, ¿cuántos…?») sin el resultado. |
| `deliverables` | Cada parte (a, b, c) como ítem y «Terminado cuando…». |
| `solution.reasoning` | El desarrollo completo con fórmulas y números; `commonError` con el error numérico típico. |

**Verifica** cada resultado calculándolo (Python/SymPy) antes de publicarlo.
