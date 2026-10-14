import type { ChallengeObjectives } from '../../../../shared/types';

/** Objetivos (R28) de los challenges de ejemplo compactos, por título. Los retos ricos los traen en su JSON. */
export const OBJECTIVES: Record<string, ChallengeObjectives> = {
  'Ventas minoristas: de SELECT a ventanas': {
    lookingFor: 'Que domines el recorrido básico de una consulta de ventas (filtrar, ordenar, agregar) y que interpretes un ranking de tiendas con criterio de negocio.',
    outcomes: ['Una consulta que filtra y ordena las ventas más relevantes.', 'Un resumen por categoría con GROUP BY y HAVING.', 'Una lectura del ranking de tiendas que señala dónde actuar.'],
    skills: ['SELECT, WHERE y ORDER BY', 'JOIN y GROUP BY', 'HAVING', 'Interpretación de KPIs'],
  },
  'Limpieza de pedidos de e-commerce': {
    lookingFor: 'Que dejes un archivo de pedidos listo para análisis, justificando cada decisión de limpieza.',
    outcomes: ['El porcentaje de nulos por columna y una imputación defendible.', 'Un DataFrame sin duplicados y con los tipos correctos.', 'Una distribución de montos con los outliers marcados.'],
    skills: ['Perfilado de datos', 'Duplicados y tipos', 'Outliers con IQR', 'Visualización de distribuciones'],
  },
  'Cohortes de retención en una app móvil': {
    lookingFor: 'Que midas si los usuarios por canal retienen igual, construyendo cohortes y leyendo la matriz de retención.',
    outcomes: ['La cohorte mensual de cada usuario con una CTE.', 'Una matriz cohorte × mes en porcentajes.', 'Dos hipótesis comprobables sobre qué cohortes retienen mejor.'],
    skills: ['CTE y fechas', 'pivot en pandas', 'Retención y churn', 'Hipótesis de negocio'],
  },
  'Predicción de churn en telecom': {
    lookingFor: 'Que entrenes y evalúes un clasificador con clases desbalanceadas y que justifiques el umbral con costos de negocio.',
    outcomes: ['Un conjunto de entrenamiento sin fuga de datos.', 'Un modelo con sus métricas (recall, precisión, F1, AUC).', 'Un umbral de decisión justificado con costos.'],
    skills: ['Preparación de variables', 'Regresión logística', 'Métricas con desbalance', 'Umbral de decisión'],
  },
  'A/B test del checkout': {
    lookingFor: 'Que decidas con rigor si un cambio de producto funciona: tamaño de muestra, hipótesis y recomendación.',
    outcomes: ['El tamaño de muestra por variante para una mejora mínima dada.', 'Valor p e intervalo de confianza de la diferencia.', 'Una recomendación de lanzamiento con riesgos.'],
    skills: ['Potencia y muestra', 'Pruebas de hipótesis', 'A/B testing', 'Recomendación a negocio'],
  },
  'Segmentación RFM de clientes': {
    lookingFor: 'Que segmentes una base de clientes con RFM y K-means y que propongas una acción distinta por segmento.',
    outcomes: ['La tabla RFM por cliente.', 'Los segmentos con su perfil medio.', 'Un plan de acción priorizado por segmento.'],
    skills: ['Variables RFM', 'K-means', 'Perfilado de segmentos', 'Priorización'],
  },
  'Pronóstico de demanda semanal': {
    lookingFor: 'Que pronostiques la demanda de las próximas semanas con validación temporal y que comuniques la incertidumbre.',
    outcomes: ['La descomposición de tendencia y estacionalidad.', 'Una validación que respeta el orden del tiempo.', 'Un modelo comparado con una línea base y un resumen con rangos.'],
    skills: ['Series de tiempo', 'Validación temporal', 'Gradient boosting', 'Comunicar incertidumbre'],
  },
  'Dashboard ejecutivo de ventas': {
    lookingFor: 'Que armes un tablero mensual con pocas métricas bien elegidas, desde el árbol de métricas hasta la visualización.',
    outcomes: ['Un árbol de métricas con una métrica norte.', 'Una consulta mensual con crecimiento frente al mes anterior.', 'Tres gráficos con títulos que concluyen.'],
    skills: ['Árbol de métricas', 'Funciones de ventana', 'Elección del gráfico', 'Dashboards'],
  },
  'Consultas lentas: índices y planes': {
    lookingFor: 'Que diagnostiques y aceleres una consulta lenta leyendo el plan de ejecución y aplicando índices.',
    outcomes: ['El nodo más costoso del plan identificado.', 'Una consulta reescrita equivalente y más barata.', 'Un resumen del antes y después para no técnicos.'],
    skills: ['EXPLAIN e índices', 'EXISTS y JOIN', 'Equivalencia de consultas', 'Comunicar mejoras'],
  },
};
