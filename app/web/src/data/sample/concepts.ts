import type { Concept, DomainId } from '../../../../shared/types';

/**
 * Datos de ejemplo del grafo: una línea por concepto, `clave: Nombre < prereq1, prereq2`.
 * Un prerrequisito sin `:` es del mismo dominio; `dominio:clave` apunta a otro dominio.
 */
const RAW: Record<DomainId, string> = {
  sql: `
select: SELECT y proyección
alias: Alias y expresiones < select
where: Filtrado con WHERE < select
operators: Operadores lógicos y de comparación < where
null: Manejo de NULL < where
distinct: DISTINCT < select
orderby: ORDER BY y LIMIT < select
like: Patrones con LIKE e ILIKE < where
in-between: IN y BETWEEN < where
case: Expresiones CASE < alias, operators
agg: Funciones de agregación < select
groupby: GROUP BY < agg
having: HAVING < groupby
joins-inner: INNER JOIN < select, where
joins-outer: LEFT, RIGHT y FULL JOIN < joins-inner, null
self-join: Self join < joins-inner
cross-join: CROSS JOIN < joins-inner
subquery: Subconsultas < where, agg
correlated: Subconsultas correlacionadas < subquery
exists: EXISTS y NOT EXISTS < subquery
cte: CTEs con WITH < subquery
recursive-cte: CTEs recursivas < cte
set-ops: UNION, INTERSECT y EXCEPT < select
window-basics: Funciones de ventana: OVER < agg, groupby
rank: ROW_NUMBER, RANK y DENSE_RANK < window-basics
lag-lead: LAG y LEAD < window-basics
frames: Ventanas móviles (ROWS y RANGE) < window-basics
ntile: NTILE y percentiles < rank
date-funcs: Funciones de fecha y hora < select
string-funcs: Funciones de texto < select
casting: Conversión de tipos < select
ddl: CREATE TABLE y tipos de datos < select
dml: INSERT, UPDATE y DELETE < ddl, where
constraints: Restricciones y claves < ddl
indexes: Índices < constraints
explain: Planes de ejecución (EXPLAIN) < indexes, joins-inner
normalization: Normalización < constraints
views: Vistas < select
transactions: Transacciones y ACID < dml
dedupe: Deduplicación con ventanas < rank, cte
cohorts: Cohortes en SQL < cte, date-funcs, window-basics
sessionize: Sesionización < lag-lead, date-funcs
pivot: Pivotado con CASE y agregación < case, groupby
`,
  python: `
syntax: Sintaxis y tipos básicos
vars: Variables y operadores < syntax
strings: Cadenas y f-strings < syntax
lists: Listas y tuplas < syntax
dicts: Diccionarios < lists
sets: Conjuntos < lists
control: Condicionales < vars
loops: Bucles for y while < control, lists
comprehensions: Comprensiones < loops, dicts
functions: Funciones < loops
args: *args, **kwargs y valores por defecto < functions
lambda: Lambdas, map y filter < functions
scope: Alcance y closures < functions
exceptions: Manejo de excepciones < functions
files: Lectura y escritura de archivos < strings, exceptions
modules: Módulos y paquetes < functions
venv: Entornos virtuales y pip < modules
classes: Clases y objetos < functions, dicts
inheritance: Herencia y polimorfismo < classes
dunder: Métodos especiales < classes
dataclasses: Dataclasses < classes
iterators: Iteradores y generadores < loops, functions
decorators: Decoradores < scope
context: Context managers < exceptions, classes
typing: Anotaciones de tipos < functions
numpy-arrays: Arreglos de NumPy < lists, vars
numpy-index: Indexado y slicing en NumPy < numpy-arrays
broadcasting: Broadcasting < numpy-index
vectorization: Vectorización < broadcasting, loops
pandas-series: Series y DataFrames < numpy-arrays, dicts
pandas-select: Selección con loc e iloc < pandas-series
pandas-filter: Filtrado booleano < pandas-select
pandas-groupby: groupby y agregaciones < pandas-filter
pandas-merge: merge y concat < pandas-select
pandas-pivot: pivot y melt < pandas-groupby
pandas-datetime: Fechas en pandas < pandas-series
pandas-apply: apply y funciones vectorizadas < pandas-series, lambda
regex: Expresiones regulares < strings
testing: Pruebas con pytest < functions, exceptions
perf: Perfilado y rendimiento < vectorization, iterators
`,
  math: `
arith: Aritmética y proporciones
algebra: Álgebra básica < arith
functions-m: Funciones y gráficas < algebra
exp-log: Exponenciales y logaritmos < functions-m
sequences: Sucesiones y series < algebra
sets-logic: Conjuntos y lógica < arith
combinatorics: Combinatoria < sets-logic
probability: Probabilidad básica < combinatorics
conditional: Probabilidad condicional < probability
bayes: Teorema de Bayes < conditional
independence: Independencia < conditional
rv: Variables aleatorias < probability
expectation: Esperanza y varianza < rv
binomial: Distribución binomial < rv, combinatorics
poisson: Distribución de Poisson < rv, exp-log
normal: Distribución normal < rv, exp-log
clt: Teorema del límite central < normal, expectation
descriptive: Estadística descriptiva < arith
percentiles: Percentiles y cuantiles < descriptive
correlation: Correlación < descriptive, expectation
sampling: Muestreo y sesgo < descriptive, probability
estimation: Estimadores e intervalos de confianza < clt, sampling
hypothesis: Pruebas de hipótesis < estimation
pvalue: Valores p y errores tipo I y II < hypothesis
ttest: Prueba t < hypothesis
chi2: Chi-cuadrado < hypothesis, binomial
anova: ANOVA < ttest
ab-testing: A/B testing < ttest, pvalue
power: Potencia y tamaño de muestra < pvalue
bootstrap: Bootstrap < sampling, estimation
vectors: Vectores y producto punto < algebra
matrices: Matrices y operaciones < vectors
inverse: Inversa y determinante < matrices
eigen: Valores y vectores propios < inverse
svd: Descomposición SVD < eigen
derivatives: Derivadas < functions-m
partial: Derivadas parciales y gradiente < derivatives, vectors
chain-rule: Regla de la cadena < derivatives
optimization: Optimización y mínimos < partial
mle: Máxima verosimilitud < expectation, optimization, exp-log
`,
  ml: `
ml-intro: Aprendizaje supervisado y no supervisado < math:descriptive
features: Variables y etiquetas < ml-intro
split: Train/test split < features
overfit: Sobreajuste y subajuste < split
bias-var: Sesgo y varianza < overfit, math:expectation
cv: Validación cruzada < split
linreg: Regresión lineal < features, math:matrices
cost: Funciones de costo (MSE) < linreg, math:derivatives
gd: Descenso por gradiente < cost, math:partial
regularization: Regularización L1 y L2 < linreg, overfit
logreg: Regresión logística < linreg, math:exp-log
metrics-clf: Precisión, recall y F1 < logreg
confusion: Matriz de confusión < metrics-clf
roc: Curva ROC y AUC < metrics-clf
pr-curve: Curva precisión-recall < metrics-clf
metrics-reg: RMSE, MAE y R² < linreg
threshold: Umbral de decisión < roc
imbalance: Clases desbalanceadas < metrics-clf
knn: k vecinos más cercanos < features
naive-bayes: Naive Bayes < math:bayes, features
tree: Árboles de decisión < features
entropy: Entropía y ganancia de información < tree, math:exp-log
random-forest: Random forest < tree, bias-var
boosting: Gradient boosting < random-forest, gd
xgb: XGBoost y LightGBM < boosting
svm: Máquinas de soporte vectorial < logreg, math:vectors
kmeans: K-means < ml-intro, math:vectors
hierarchical: Clustering jerárquico < kmeans
dbscan: DBSCAN < kmeans
silhouette: Silueta y evaluación de clusters < kmeans
pca: PCA < math:eigen, features
tsne: t-SNE y UMAP < pca
anomaly: Detección de anomalías < dbscan, pca
pipelines: Pipelines de scikit-learn < split, python:pandas-select
encoding: Codificación de categóricas < features
scaling: Escalado de variables < features
feature-selection: Selección de variables < regularization, tree
feature-eng: Ingeniería de variables < encoding, scaling
hyperparams: Búsqueda de hiperparámetros < cv, pipelines
explain: Importancia de variables y SHAP < random-forest
calibration: Calibración de probabilidades < logreg, roc
timeseries-ml: Series de tiempo y validación temporal < cv, python:pandas-datetime
leakage: Fuga de datos < split, pipelines
`,
  cleaning: `
profiling: Perfilado de datos < python:pandas-series
dtypes: Tipos de datos < profiling
missing: Detección de valores faltantes < profiling
impute-simple: Imputación simple < missing
impute-adv: Imputación avanzada (KNN, iterativa) < impute-simple, ml:knn
duplicates: Duplicados < profiling
outliers-iqr: Outliers con IQR < profiling, math:percentiles
outliers-z: Outliers con z-score < profiling, math:normal
outlier-treat: Tratamiento de outliers < outliers-iqr, outliers-z
text-clean: Limpieza de texto < python:regex
categories: Normalización de categorías < text-clean
dates-clean: Fechas inconsistentes < dtypes, python:pandas-datetime
units: Unidades y escalas < dtypes
merge-keys: Llaves y uniones sucias < duplicates, python:pandas-merge
validation: Validación de reglas de negocio < dtypes
reshape: Datos tidy: de ancho a largo < python:pandas-pivot
binning: Discretización < dtypes
skew: Asimetría y transformaciones < outliers-z, math:exp-log
viz-principles: Principios de visualización
chart-choice: Elección del gráfico adecuado < viz-principles
bar: Barras y barras apiladas < chart-choice
line: Líneas y series temporales < chart-choice
scatter: Dispersión < chart-choice, math:correlation
hist: Histogramas y densidades < chart-choice, math:descriptive
box: Boxplots < chart-choice, math:percentiles
heatmap: Mapas de calor < chart-choice, math:correlation
small-multiples: Pequeños múltiplos < bar, line
color: Color y accesibilidad < viz-principles
annotations: Títulos y anotaciones < viz-principles
matplotlib: Matplotlib < python:pandas-series, chart-choice
seaborn: Seaborn < matplotlib
plotly: Plotly interactivo < matplotlib
dashboards: Dashboards < plotly, annotations
storytelling: Narrativa con datos < annotations, dashboards
misleading: Gráficos engañosos < viz-principles
eda: Análisis exploratorio completo < hist, box, scatter, missing
pipelines-clean: Pipelines de limpieza reproducibles < eda, python:functions
`,
  business: `
kpis: KPIs y métricas
funnel: Embudos de conversión < kpis
retention: Retención < kpis
cohort: Análisis de cohortes < retention, sql:cohorts
churn: Churn < retention
ltv: Valor de vida del cliente (LTV) < churn, math:expectation
cac: CAC y payback < kpis
unit-econ: Economía unitaria < ltv, cac
north-star: North Star Metric < kpis
segmentation: Segmentación de clientes < kpis, ml:kmeans
rfm: Análisis RFM < segmentation, sql:ntile
pareto: Análisis de Pareto < kpis, cleaning:bar
abc: Clasificación ABC < pareto
pricing: Elasticidad de precios < math:correlation, unit-econ
forecasting: Pronóstico de demanda < ml:timeseries-ml
seasonality: Estacionalidad < forecasting
experiment-design: Diseño de experimentos < math:ab-testing
experiment-read: Lectura de resultados de experimentos < experiment-design, math:pvalue
attribution: Atribución de marketing < funnel
roi: ROI y márgenes < kpis
break-even: Punto de equilibrio < roi
margin-analysis: Análisis de márgenes < roi, sql:groupby
variance: Análisis de variación (real vs. plan) < kpis
dashboards-biz: Dashboards ejecutivos < kpis, cleaning:dashboards
requirements: De pregunta de negocio a análisis < kpis
hypothesis-biz: Hipótesis de negocio < requirements
prioritization: Priorización impacto y esfuerzo < requirements
stakeholder: Comunicación con stakeholders < cleaning:storytelling
recommendations: Recomendaciones accionables < stakeholder, hypothesis-biz
risk: Riesgos y supuestos < recommendations
sizing: Dimensionamiento de mercado (TAM, SAM, SOM) < requirements
competitive: Benchmark competitivo < sizing
supply-chain: Inventario y rotación < abc
sla: SLAs y métricas operativas < kpis
data-quality-biz: Calidad de datos para decisiones < cleaning:validation, kpis
metric-tree: Árbol de métricas < north-star, kpis
anomaly-biz: Alertas y anomalías de negocio < ml:anomaly, kpis
case-study: Caso de negocio de punta a punta < recommendations, risk, sql:cte
`,
};

export function parseConcepts(raw: Record<DomainId, string> = RAW): Concept[] {
  const concepts: Concept[] = [];
  for (const [domain, text] of Object.entries(raw) as [DomainId, string][]) {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colon = trimmed.indexOf(':');
      const key = trimmed.slice(0, colon).trim();
      const [name = '', prereqs = ''] = trimmed.slice(colon + 1).split('<').map((p) => p.trim());
      concepts.push({
        id: `${domain}:${key}`,
        name,
        domain,
        prerequisites: prereqs
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => (p.includes(':') ? p : `${domain}:${p}`)),
      });
    }
  }
  return concepts;
}

export const SAMPLE_CONCEPTS: Concept[] = parseConcepts();
