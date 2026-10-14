import type { Bloom, Challenge, Difficulty, DomainId, EvalMechanism, Stage, TableDef } from '../../../../shared/types';
import { enrichChallenges } from './rich';

interface SchemaSpec {
  table: string;
  columns: { name: string; type: string }[];
}

interface StageSpec {
  title: string;
  domain: DomainId;
  d: Difficulty;
  bloom: Bloom;
  min: number;
  mech: EvalMechanism;
  desc: string;
  deliverables: string[];
  concepts: string[];
  step: string;
  hint: string;
  ver: string;
  sol: string;
}

interface ChallengeSpec {
  title: string;
  dataset: string;
  d: Difficulty;
  recommended?: boolean;
  statement: string;
  schema: SchemaSpec[];
  questions: string[];
  stages: StageSpec[];
}

const t = (table: string, cols: string): SchemaSpec => ({
  table,
  columns: cols.split(',').map((c) => {
    const [name = '', type = 'text'] = c.trim().split(' ');
    return { name, type };
  }),
});

const SPECS: ChallengeSpec[] = [
  {
    title: 'Ventas minoristas: de SELECT a ventanas',
    dataset: 'Retail Sales',
    d: 1,
    statement:
      'Una cadena de tiendas quiere entender qué categorías y tiendas explican la mayor parte de sus ventas del último trimestre. Trabajas con el historial de transacciones y debes responder con consultas claras y con una lectura de negocio.',
    schema: [
      t('sales', 'sale_id int, store_id int, product_id int, sold_at date, units int, amount numeric'),
      t('products', 'product_id int, name text, category text'),
      t('stores', 'store_id int, city text, region text'),
    ],
    questions: ['¿Qué categorías concentran el 80 % de las ventas?', '¿Qué tiendas están por debajo del promedio regional?', '¿Cuál es el ticket medio por ciudad?'],
    stages: [
      { title: 'Filtrar y ordenar ventas', domain: 'sql', d: 1, bloom: 2, min: 15, mech: 'codigo_assert', desc: 'Selecciona las ventas de octubre con monto mayor a 100 y ordénalas de mayor a menor.', deliverables: ['Consulta con SELECT, WHERE y ORDER BY', 'Resultado limitado a las 20 primeras filas'], concepts: ['sql:select', 'sql:where', 'sql:orderby'], step: 'Empieza por filtrar por fecha y luego por monto.', hint: 'WHERE admite condiciones combinadas con AND.', ver: 'Se ejecuta tu consulta y se comparan filas y orden con el resultado esperado.', sol: 'SELECT * FROM sales WHERE sold_at >= \'2026-10-01\' AND amount > 100 ORDER BY amount DESC LIMIT 20;' },
      { title: 'Ventas por categoría', domain: 'sql', d: 1, bloom: 3, min: 20, mech: 'codigo_assert', desc: 'Calcula ventas totales y unidades por categoría, dejando solo las categorías con más de 10 000 en ventas.', deliverables: ['Consulta con JOIN y GROUP BY', 'Filtro con HAVING'], concepts: ['sql:groupby', 'sql:agg', 'sql:having'], step: 'Une sales con products y agrupa por categoría.', hint: 'HAVING filtra después de agrupar; WHERE, antes.', ver: 'Se compara el resultado agregado contra el esperado.', sol: 'SELECT p.category, SUM(s.amount) AS total FROM sales s JOIN products p USING (product_id) GROUP BY p.category HAVING SUM(s.amount) > 10000;' },
      { title: 'Interpretar el ranking de tiendas', domain: 'business', d: 1, bloom: 4, min: 15, mech: 'rubric_claude', desc: 'Con el ranking de ventas por tienda, explica en un párrafo qué tiendas requieren atención y por qué.', deliverables: ['Párrafo de 5 a 8 líneas', 'Una recomendación concreta'], concepts: ['business:kpis', 'business:pareto'], step: 'Identifica primero cuántas tiendas explican la mayor parte de las ventas.', hint: 'Compara cada tienda contra el promedio de su región.', ver: 'Rúbrica: usa cifras del ranking, distingue síntoma de causa y propone una acción.', sol: 'Tres tiendas concentran el 55 % de las ventas; las cuatro del fondo caen más de 30 % bajo su promedio regional…' },
    ],
  },
  {
    title: 'Limpieza de pedidos de e-commerce',
    dataset: 'E-commerce Orders',
    d: 1,
    statement: 'El equipo de operaciones sospecha que el archivo de pedidos tiene duplicados, valores faltantes y montos atípicos que distorsionan los reportes. Debes dejarlo listo para análisis y documentar cada decisión.',
    schema: [t('orders', 'order_id int, customer_id int, created_at text, status text, total text, coupon text')],
    questions: ['¿Qué porcentaje de pedidos estaba duplicado?', '¿Cómo cambia el ticket medio tras tratar outliers?'],
    stages: [
      { title: 'Perfilado y valores faltantes', domain: 'cleaning', d: 1, bloom: 2, min: 20, mech: 'codigo_assert', desc: 'Perfila el DataFrame y reporta el porcentaje de nulos por columna; imputa los faltantes de forma justificada.', deliverables: ['Tabla de nulos por columna', 'Imputación documentada'], concepts: ['cleaning:profiling', 'cleaning:missing', 'cleaning:impute-simple'], step: 'Usa df.isna().mean() para medir el porcentaje de nulos.', hint: 'La mediana es más robusta que la media con montos atípicos.', ver: 'Se verifica que no queden nulos en las columnas imputadas.', sol: 'df["total"] = df["total"].fillna(df["total"].median())' },
      { title: 'Duplicados y tipos de datos', domain: 'python', d: 1, bloom: 3, min: 20, mech: 'codigo_assert', desc: 'Elimina pedidos duplicados y convierte fechas y montos a su tipo correcto.', deliverables: ['DataFrame sin duplicados', 'Columnas created_at y total con tipo correcto'], concepts: ['cleaning:duplicates', 'cleaning:dtypes', 'python:pandas-filter'], step: 'Decide qué columnas definen un duplicado antes de borrar.', hint: 'pd.to_datetime y pd.to_numeric admiten errors="coerce".', ver: 'Se comparan conteo de filas y dtypes con los esperados.', sol: 'df = df.drop_duplicates("order_id"); df["created_at"] = pd.to_datetime(df["created_at"])' },
      { title: 'Visualizar la distribución de montos', domain: 'cleaning', d: 1, bloom: 3, min: 20, mech: 'codigo_assert', desc: 'Grafica la distribución del monto y marca los outliers según el criterio del IQR.', deliverables: ['Histograma y boxplot', 'Lista de outliers detectados'], concepts: ['cleaning:hist', 'cleaning:box', 'cleaning:outliers-iqr'], step: 'Calcula Q1, Q3 y el límite superior antes de graficar.', hint: 'Límite superior = Q3 + 1.5 × IQR.', ver: 'Se comprueba el conteo de outliers detectados.', sol: 'q1, q3 = df.total.quantile([.25,.75]); iqr = q3 - q1; out = df[df.total > q3 + 1.5*iqr]' },
    ],
  },
  {
    title: 'Cohortes de retención en una app móvil',
    dataset: 'App Events',
    d: 2,
    statement: 'Producto quiere saber si los usuarios que llegan por campañas retienen igual que los orgánicos. Construyes las cohortes mensuales, la matriz de retención y una lectura para el equipo.',
    schema: [t('users', 'user_id int, signup_at date, channel text'), t('events', 'user_id int, event_at timestamp, event text')],
    questions: ['¿Qué cohorte retiene mejor a 30 días?', '¿Hay diferencia entre canal pagado y orgánico?', '¿Dónde está la mayor caída?'],
    stages: [
      { title: 'Cohorte de primera compra', domain: 'sql', d: 2, bloom: 3, min: 30, mech: 'codigo_assert', desc: 'Asigna a cada usuario su cohorte mensual con una CTE y cuenta los usuarios por cohorte.', deliverables: ['CTE con la cohorte de cada usuario', 'Conteo por cohorte'], concepts: ['sql:cte', 'sql:date-funcs', 'sql:cohorts'], step: 'DATE_TRUNC sobre la fecha de alta te da el mes de cohorte.', hint: 'Una CTE mantiene la consulta legible.', ver: 'Se compara el conteo por cohorte con el esperado.', sol: 'WITH c AS (SELECT user_id, DATE_TRUNC(\'month\', signup_at) AS cohort FROM users) SELECT cohort, COUNT(*) FROM c GROUP BY 1;' },
      { title: 'Matriz de retención en pandas', domain: 'python', d: 2, bloom: 4, min: 30, mech: 'codigo_assert', desc: 'Calcula la retención por mes desde el alta y preséntala como matriz cohorte × mes.', deliverables: ['DataFrame cohorte × mes', 'Valores como porcentaje de la cohorte'], concepts: ['python:pandas-pivot', 'python:pandas-datetime', 'business:retention'], step: 'Calcula la diferencia en meses entre el evento y el alta.', hint: 'pivot_table con index=cohorte y columns=mes.', ver: 'Se verifica la forma de la matriz y la primera columna en 100 %.', sol: 'm = df.pivot_table(index="cohort", columns="age", values="user_id", aggfunc="nunique")' },
      { title: '¿Qué cohortes retienen mejor?', domain: 'business', d: 2, bloom: 5, min: 20, mech: 'rubric_claude', desc: 'Interpreta la matriz y responde qué cohortes retienen mejor y qué acción recomiendas.', deliverables: ['Interpretación de 6 a 10 líneas', 'Dos hipótesis a validar'], concepts: ['business:cohort', 'business:retention', 'business:churn'], step: 'Compara la retención al mes 1 entre cohortes.', hint: 'Distingue una caída puntual de una tendencia.', ver: 'Rúbrica: cita cifras, evita causalidad sin prueba y propone hipótesis comprobables.', sol: 'Las cohortes de agosto retienen 8 puntos más al mes 1…' },
    ],
  },
  {
    title: 'Predicción de churn en telecom',
    dataset: 'Telecom Customers',
    d: 2,
    statement: 'Una operadora quiere anticipar qué clientes cancelarán el servicio. Construyes un modelo de clasificación, lo evalúas con las métricas adecuadas para clases desbalanceadas y justificas el umbral de decisión.',
    schema: [t('customers', 'customer_id int, tenure int, contract text, monthly_charges numeric, total_charges numeric, churn bool')],
    questions: ['¿Qué variables explican más el churn?', '¿Qué umbral conviene para campañas de retención?'],
    stages: [
      { title: 'Preparar variables', domain: 'ml', d: 2, bloom: 3, min: 30, mech: 'codigo_assert', desc: 'Codifica las variables categóricas, escala las numéricas y separa entrenamiento y prueba sin fuga de datos.', deliverables: ['X_train, X_test, y_train, y_test', 'Transformaciones ajustadas solo con entrenamiento'], concepts: ['ml:encoding', 'ml:scaling', 'ml:split'], step: 'Divide primero y ajusta el escalador después.', hint: 'fit en train, transform en train y test.', ver: 'Se comprueban las formas y que el escalador no haya visto test.', sol: 'X_tr, X_te, y_tr, y_te = train_test_split(X, y, stratify=y, random_state=0)' },
      { title: 'Entrenar regresión logística', domain: 'ml', d: 2, bloom: 3, min: 35, mech: 'codigo_assert', desc: 'Entrena una regresión logística regularizada y compara su desempeño en train y test.', deliverables: ['Modelo entrenado', 'Comparación train vs. test'], concepts: ['ml:logreg', 'ml:overfit', 'ml:regularization'], step: 'Prueba varios valores de C.', hint: 'Una gran brecha train/test indica sobreajuste.', ver: 'Se evalúa el modelo en el conjunto de prueba oculto.', sol: 'LogisticRegression(C=0.5, max_iter=1000).fit(X_tr, y_tr)' },
      { title: 'Evaluar con métricas correctas', domain: 'ml', d: 2, bloom: 4, min: 30, mech: 'codigo_assert', desc: 'Reporta recall, precisión, F1 y AUC; explica por qué la exactitud engaña con clases desbalanceadas.', deliverables: ['Reporte de métricas', 'Curva ROC'], concepts: ['ml:metrics-clf', 'ml:roc', 'ml:imbalance'], step: 'Empieza por la matriz de confusión.', hint: 'class_weight="balanced" ayuda con el desbalance.', ver: 'Se contrastan las métricas reportadas con las recalculadas.', sol: 'print(classification_report(y_te, pred)); roc_auc_score(y_te, proba)' },
      { title: 'Justificar el umbral de decisión', domain: 'ml', d: 2, bloom: 5, min: 20, mech: 'rubric_claude', desc: 'Elige un umbral de probabilidad y justifica el equilibrio entre falsos positivos y falsos negativos para la campaña.', deliverables: ['Umbral elegido', 'Justificación con costos'], concepts: ['ml:threshold', 'ml:calibration'], step: 'Estima cuánto cuesta contactar a un cliente que no se iba.', hint: 'Compara el costo de un falso negativo con el de un falso positivo.', ver: 'Rúbrica: relaciona el umbral con costos de negocio y con la curva precisión-recall.', sol: 'Con costo de retención 5 y pérdida por churn 60, conviene un umbral de ~0.25…' },
    ],
  },
  {
    title: 'A/B test del checkout',
    dataset: 'Checkout Experiment',
    d: 2,
    statement: 'Se probó un nuevo checkout de un solo paso contra el actual. Debes decidir si el tamaño de muestra fue suficiente, probar la hipótesis y recomendar si se lanza.',
    schema: [t('assignments', 'user_id int, variant text, assigned_at timestamp'), t('purchases', 'user_id int, purchased_at timestamp, amount numeric')],
    questions: ['¿La mejora en conversión es estadísticamente significativa?', '¿Qué riesgo tiene lanzar con estos datos?'],
    stages: [
      { title: 'Tamaño de muestra y potencia', domain: 'math', d: 2, bloom: 3, min: 30, mech: 'codigo_assert', desc: 'Calcula el tamaño de muestra necesario por variante para detectar una mejora de 2 puntos con potencia 0.8.', deliverables: ['Tamaño de muestra por grupo', 'Supuestos explícitos'], concepts: ['math:power', 'math:pvalue'], step: 'Fija alfa, potencia y efecto mínimo detectable.', hint: 'statsmodels tiene calculadoras de potencia.', ver: 'Se compara tu tamaño de muestra con el esperado (±5 %).', sol: 'NormalIndPower().solve_power(effect_size=0.1, alpha=.05, power=.8)' },
      { title: 'Prueba de hipótesis', domain: 'math', d: 2, bloom: 4, min: 30, mech: 'codigo_assert', desc: 'Contrasta la diferencia de conversión entre variantes y reporta valor p e intervalo de confianza.', deliverables: ['Estadístico y valor p', 'Intervalo de confianza de la diferencia'], concepts: ['math:ttest', 'math:hypothesis', 'math:ab-testing'], step: 'Plantea H0 y H1 antes de calcular.', hint: 'Para proporciones usa una prueba z de dos proporciones.', ver: 'Se contrastan estadístico y valor p con los esperados.', sol: 'proportions_ztest([conv_b, conv_a], [n_b, n_a])' },
      { title: 'Recomendar o no el lanzamiento', domain: 'business', d: 2, bloom: 5, min: 20, mech: 'rubric_claude', desc: 'Redacta una recomendación para el equipo de producto con riesgos y próximos pasos.', deliverables: ['Recomendación en 5 a 8 líneas', 'Riesgos y supuestos'], concepts: ['business:experiment-read', 'business:recommendations'], step: 'Abre con la decisión y justifícala con una cifra.', hint: 'Distingue significancia estadística de relevancia práctica.', ver: 'Rúbrica: decisión clara, cifra de respaldo, riesgos y siguiente paso.', sol: 'Recomiendo lanzar: la conversión sube 1.8 pts (IC95 % 0.6–3.0)…' },
    ],
  },
  {
    title: 'Segmentación RFM de clientes',
    dataset: 'Customer Orders',
    d: 2,
    statement: 'Marketing quiere dejar de enviar la misma campaña a todos los clientes. Segmentas la base con recencia, frecuencia y monto, la agrupas con K-means y propones una acción por segmento.',
    schema: [t('customers', 'customer_id int, joined_at date, country text'), t('orders', 'order_id int, customer_id int, ordered_at date, total numeric')],
    questions: ['¿Cuántos segmentos accionables existen?', '¿Qué segmento tiene mayor riesgo de fuga?', '¿Dónde conviene invertir primero?'],
    stages: [
      { title: 'Calcular recencia, frecuencia y monto', domain: 'sql', d: 2, bloom: 3, min: 30, mech: 'codigo_assert', desc: 'Obtén por cliente los días desde su última compra, el número de pedidos y el monto total.', deliverables: ['Tabla customer_id, recency, frequency, monetary'], concepts: ['sql:agg', 'sql:date-funcs', 'business:rfm'], step: 'Agrupa por cliente y toma MAX de la fecha.', hint: 'Fija una fecha de corte para calcular la recencia.', ver: 'Se compara tu tabla con la esperada.', sol: 'SELECT customer_id, CURRENT_DATE - MAX(ordered_at) AS recency, COUNT(*) AS frequency, SUM(total) AS monetary FROM orders GROUP BY 1;' },
      { title: 'Escalar y agrupar con K-means', domain: 'ml', d: 2, bloom: 3, min: 35, mech: 'codigo_assert', desc: 'Escala las variables RFM, elige k con la silueta y agrupa a los clientes.', deliverables: ['Valor de k justificado', 'Columna segment en el DataFrame'], concepts: ['ml:scaling', 'ml:kmeans', 'ml:silhouette'], step: 'Prueba k de 2 a 8 y compara la silueta.', hint: 'K-means es sensible a la escala de las variables.', ver: 'Se verifica que existan k segmentos y la silueta mínima.', sol: 'KMeans(n_clusters=4, n_init=10, random_state=0).fit_predict(StandardScaler().fit_transform(rfm))' },
      { title: 'Perfilar los segmentos', domain: 'python', d: 2, bloom: 4, min: 30, mech: 'codigo_assert', desc: 'Calcula el perfil medio de cada segmento y nómbralos de forma que el equipo de marketing los entienda.', deliverables: ['Tabla de perfil por segmento', 'Nombre y descripción de cada uno'], concepts: ['python:pandas-groupby', 'business:segmentation'], step: 'Agrupa por segmento y promedia R, F y M.', hint: 'Ordena los segmentos por monto medio.', ver: 'Se contrastan las medias por segmento con las esperadas.', sol: 'rfm.groupby("segment")[["recency","frequency","monetary"]].mean()' },
      { title: 'Plan de acción por segmento', domain: 'business', d: 2, bloom: 6, min: 25, mech: 'rubric_claude', desc: 'Propone una acción concreta por segmento y prioriza dónde empezar.', deliverables: ['Una acción por segmento', 'Priorización impacto/esfuerzo'], concepts: ['business:recommendations', 'business:prioritization'], step: 'Empieza por el segmento con mayor valor en riesgo.', hint: 'Una acción debe tener responsable, canal y métrica.', ver: 'Rúbrica: acciones específicas, priorizadas y medibles.', sol: 'Prioridad 1: clientes de alto valor con recencia alta, campaña de reactivación…' },
    ],
  },
  {
    title: 'Pronóstico de demanda semanal',
    dataset: 'Weekly Demand',
    d: 3,
    recommended: true,
    statement: 'Operaciones necesita estimar la demanda de las próximas 8 semanas para planear inventario. Construyes un modelo con validación temporal y comunicas la incertidumbre del pronóstico.',
    schema: [t('demand', 'week date, sku text, units int, promo bool, price numeric')],
    questions: ['¿Qué tan confiable es el pronóstico a 8 semanas?', '¿Qué efecto tienen las promociones?'],
    stages: [
      { title: 'Descomponer tendencia y estacionalidad', domain: 'business', d: 3, bloom: 4, min: 35, mech: 'codigo_assert', desc: 'Descompón la serie en tendencia, estacionalidad y residuo, y describe el patrón estacional.', deliverables: ['Descomposición graficada', 'Periodo estacional identificado'], concepts: ['business:seasonality', 'ml:timeseries-ml'], step: 'Empieza graficando la serie cruda.', hint: 'seasonal_decompose necesita el periodo.', ver: 'Se comprueba el periodo estacional detectado.', sol: 'seasonal_decompose(series, period=52, model="additive")' },
      { title: 'Validación temporal', domain: 'ml', d: 3, bloom: 4, min: 35, mech: 'codigo_assert', desc: 'Diseña una validación que respete el orden del tiempo y evita fuga de datos del futuro.', deliverables: ['Esquema de validación', 'Explicación de la fuga evitada'], concepts: ['ml:timeseries-ml', 'ml:cv', 'ml:leakage'], step: 'Nunca entrenes con datos posteriores a los que evalúas.', hint: 'TimeSeriesSplit mantiene el orden.', ver: 'Se verifica que ningún fold entrene con fechas futuras.', sol: 'TimeSeriesSplit(n_splits=5, test_size=8)' },
      { title: 'Modelo con gradient boosting', domain: 'ml', d: 3, bloom: 5, min: 40, mech: 'codigo_assert', desc: 'Entrena un modelo de boosting con variables de calendario y rezagos, y compáralo con una línea base.', deliverables: ['Modelo y línea base', 'Error medio por horizonte'], concepts: ['ml:boosting', 'ml:feature-eng', 'ml:hyperparams'], step: 'Crea rezagos y medias móviles como variables.', hint: 'Compárate siempre con un pronóstico ingenuo.', ver: 'Se compara tu error con el umbral esperado.', sol: 'HistGradientBoostingRegressor(max_depth=4).fit(X_tr, y_tr)' },
      { title: 'Comunicar la incertidumbre', domain: 'business', d: 3, bloom: 5, min: 25, mech: 'rubric_claude', desc: 'Explica el pronóstico y su rango de incertidumbre a alguien de operaciones sin formación estadística.', deliverables: ['Resumen de 6 a 8 líneas', 'Rango esperado y riesgos'], concepts: ['business:forecasting', 'business:risk'], step: 'Habla de rangos, no de un solo número.', hint: 'Relaciona el error con unidades de inventario.', ver: 'Rúbrica: rango claro, lenguaje simple y riesgos accionables.', sol: 'Esperamos entre 1 100 y 1 450 unidades por semana…' },
    ],
  },
  {
    title: 'Dashboard ejecutivo de ventas',
    dataset: 'Sales Warehouse',
    d: 2,
    statement: 'Dirección pide un tablero mensual con pocas métricas bien elegidas. Defines el árbol de métricas, las calculas con SQL y las visualizas con criterio.',
    schema: [t('fact_sales', 'date_id int, product_id int, customer_id int, revenue numeric, cost numeric')],
    questions: ['¿Cuál es la métrica norte?', '¿Qué decisiones habilita cada gráfico?'],
    stages: [
      { title: 'Definir el árbol de métricas', domain: 'business', d: 2, bloom: 3, min: 20, mech: 'rubric_claude', desc: 'Elige una métrica norte y descomponla en 3 a 4 métricas que el equipo pueda mover.', deliverables: ['Árbol de métricas', 'Una línea de justificación por métrica'], concepts: ['business:metric-tree', 'business:north-star'], step: 'Parte de la decisión que debe tomar dirección.', hint: 'Cada rama debe poder influirse.', ver: 'Rúbrica: métrica norte clara y ramas accionables.', sol: 'Ingreso mensual = clientes activos × pedidos × ticket medio.' },
      { title: 'Consultar las métricas con SQL', domain: 'sql', d: 2, bloom: 3, min: 30, mech: 'codigo_assert', desc: 'Calcula ingreso, margen y crecimiento mensual con CTEs y funciones de ventana.', deliverables: ['Consulta mensual con crecimiento vs. mes anterior'], concepts: ['sql:cte', 'sql:window-basics', 'sql:pivot'], step: 'Agrega por mes y usa LAG para el mes previo.', hint: 'LAG(ingreso) OVER (ORDER BY mes).', ver: 'Se compara el resultado mensual con el esperado.', sol: 'WITH m AS (...) SELECT mes, ingreso, ingreso / LAG(ingreso) OVER (ORDER BY mes) - 1 AS crecimiento FROM m;' },
      { title: 'Construir las visualizaciones', domain: 'cleaning', d: 2, bloom: 4, min: 35, mech: 'codigo_assert', desc: 'Elige el gráfico adecuado para cada métrica y arma el tablero con títulos que concluyan.', deliverables: ['3 gráficos con títulos de conclusión', 'Tablero interactivo'], concepts: ['cleaning:chart-choice', 'cleaning:plotly', 'cleaning:dashboards'], step: 'Elige el gráfico según la pregunta, no según el dato.', hint: 'Un título que concluye vale más que uno que describe.', ver: 'Se valida la existencia de las tres figuras y sus títulos.', sol: 'fig = px.line(m, x="mes", y="ingreso", title="El ingreso crece 6 % mensual")' },
    ],
  },
  {
    title: 'Consultas lentas: índices y planes',
    dataset: 'Orders Warehouse',
    d: 3,
    recommended: true,
    statement: 'Un reporte tarda 40 segundos. Lees el plan de ejecución, aplicas índices y reescribes una consulta para bajar el tiempo, y documentas el resultado.',
    schema: [t('orders', 'order_id int, customer_id int, ordered_at date, status text'), t('order_items', 'order_id int, product_id int, qty int, price numeric')],
    questions: ['¿Qué operación domina el costo del plan?', '¿Qué mejora medible se logró?'],
    stages: [
      { title: 'Leer un plan EXPLAIN', domain: 'sql', d: 3, bloom: 4, min: 30, mech: 'codigo_assert', desc: 'Identifica en el plan el nodo más costoso y propone el índice que lo evitaría.', deliverables: ['Nodo más costoso', 'CREATE INDEX propuesto'], concepts: ['sql:explain', 'sql:indexes'], step: 'Busca Seq Scan sobre tablas grandes.', hint: 'Un índice ayuda a las columnas filtradas con alta selectividad.', ver: 'Se ejecuta tu índice y se compara el plan resultante.', sol: 'CREATE INDEX ON orders (ordered_at, status);' },
      { title: 'Reescribir una subconsulta correlacionada', domain: 'sql', d: 3, bloom: 5, min: 35, mech: 'codigo_assert', desc: 'Reescribe la subconsulta correlacionada con EXISTS o con un JOIN y compara los costos.', deliverables: ['Consulta reescrita', 'Costos antes y después'], concepts: ['sql:correlated', 'sql:exists', 'sql:joins-inner'], step: 'Comprueba primero que ambas versiones dan el mismo resultado.', hint: 'EXISTS corta en cuanto encuentra una coincidencia.', ver: 'Se verifica la equivalencia del resultado.', sol: 'SELECT c.* FROM customers c WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);' },
      { title: 'Documentar la mejora', domain: 'business', d: 3, bloom: 3, min: 15, mech: 'rubric_claude', desc: 'Resume la mejora para el equipo no técnico: qué cambió, cuánto mejoró y qué riesgo tiene.', deliverables: ['Resumen de 5 líneas'], concepts: ['business:stakeholder'], step: 'Empieza por el resultado, no por el método.', hint: 'Usa una comparación antes/después.', ver: 'Rúbrica: resultado cuantificado, lenguaje claro y riesgo señalado.', sol: 'El reporte pasó de 40 s a 3 s; el índice añade 2 % de espacio…' },
    ],
  },
];

/** Deduce PK/FK por convención de nombres (`x_id` → tabla `x`/`xs`) para los challenges de ejemplo compactos. */
function toTables(schema: SchemaSpec[]): TableDef[] {
  const names = new Set(schema.map((t) => t.table));
  const target = (prefix: string) => [prefix, `${prefix}s`, `${prefix}es`].find((n) => names.has(n));
  return schema.map((spec) => ({
    name: spec.table,
    columns: spec.columns.map((col, i) => {
      const isId = col.name === 'id' || col.name.endsWith('_id');
      const ref = isId ? target(col.name.replace(/_id$/, '')) : undefined;
      const own = ref === spec.table;
      return {
        ...col,
        ...(i === 0 && isId ? { pk: true } : {}),
        ...(!(i === 0 && isId) && ref && !own ? { fk: { table: ref, column: col.name } } : {}),
      };
    }),
    rowCount: 0,
    sampleRows: [],
  }));
}

export function buildChallenges(): Challenge[] {
  const base = SPECS.map((spec, ci) => {
    const number = ci + 1;
    const id = `c${String(number).padStart(3, '0')}`;
    const stages: Stage[] = spec.stages.map((s, si) => ({
      id: `${id}-s${si + 1}`,
      challengeId: id,
      number: si + 1,
      title: s.title,
      domain: s.domain,
      difficulty: s.d,
      bloom: s.bloom,
      estimatedMinutes: s.min,
      mechanism: s.mech,
      description: s.desc,
      conceptIds: s.concepts,
      apoyo: s.d === 1 ? 'guiado' : s.d === 2 ? 'pistas' : 'autonomo',
      content: {
        steps: [s.step],
        hints: [s.hint],
        deliverables: s.deliverables,
        solution: { code: s.sol, reasoning: s.ver },
      },
    }));
    return {
      id,
      number,
      title: spec.title,
      dataset: spec.dataset,
      difficulty: spec.d,
      recommended: spec.recommended ?? false,
      scenario: spec.statement,
      task: '',
      data: { engine: 'duckdb' as const, tables: toTables(spec.schema) },
      businessQuestions: spec.questions.map((text, qi) => ({ id: `${id}-bq${qi + 1}`, text })),
      stages,
    } satisfies Challenge;
  });
  return enrichChallenges(base);
}
