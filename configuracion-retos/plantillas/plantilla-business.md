# Plantilla · Business Analytics

**Dominio:** `business` · **Mecanismo:** `rubric_claude`. Este Tipo no lleva «Preguntas de negocio» propias: el reto
entero es de negocio, pero un challenge de varias etapas sí puede cerrar con ellas.

## Modos

### KPI con datos / KPI conceptual
- **Fórmulas de referencia** en `theory` (LaTeX): conversión, churn y retención, LTV, CAC payback, márgenes…
- Un **ejemplo verificado** con números (p. ej. 500 clientes, 20 bajas/mes, ARPU \$30, margen 70 % → churn 4 %, LTV \$525).
- Los datos dan los **insumos** (clientes, bajas, ingresos), nunca el KPI ya calculado.
- Entregable: el KPI con fórmula y unidades, una recomendación de 2–4 líneas, una limitación o supuesto.

### Caso analítico
Una petición **realista y ambigua** («estamos perdiendo clientes»). El entregable es un *brief* con 7 secciones:
1. Pregunta analítica reformulada (específica y medible) · 2. Hipótesis (varias) · 3. Datos que necesitarías ·
4. Enfoque analítico (y por qué no los otros dos más obvios) · 5. Métrica de éxito · 6. Formato de entrega y a quién ·
7. Riesgos y supuestos.
- `steps` (Guiado): recorre las 7 preguntas con 1–2 líneas de qué debe contener cada una y **un ejemplo completo en otro
  caso** (p. ej. el clásico «Churn Decision»).
- No hay una única solución: `solution` es *un* brief sólido, aclarando qué otros enfoques serían defendibles.
- `commonError`: saltar a «necesito un modelo» sin definir la pregunta, confundir correlación con causalidad, no definir
  la métrica de éxito.
