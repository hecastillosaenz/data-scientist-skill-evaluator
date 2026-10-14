# UI/UX — data-scientist-skill-evaluator

> Especificación visual autocontenida, adaptada del PRD "Plataforma de retos data science" v1.0 para la arquitectura local-first de este proyecto (ver `SDD.md` §7.1 para el detalle de qué se adoptó, adaptó o excluyó de cada sección del PRD original). Sin autenticación, sin multiusuario, sin backend HTTP — toda referencia a "API" se resuelve contra el orquestador local.

---

## 1. Sistema visual

### 1.1 Principios
- Base neutra y clara con tarjetas blancas; un único color de acento.
- Color semántico solo para dificultad y para el estado "con fallos".
- Monoespaciada solo para números, tiempos y código.
- Sin emojis ni ilustraciones de personajes.

### 1.2 Tipografía
| Uso | Fuente | Peso | Tamaño |
|---|---|---|---|
| H1 de pantalla | Geist | 600 | clamp(22px, 2.4vw, 28px) |
| H1 del challenge | Geist | 600 | clamp(26px, 3vw, 36px) |
| H2 de tarjeta | Geist | 600 | 16–17px |
| H3 / etiqueta de bloque | Geist | 500 | 12px, color `--muted` |
| Cuerpo | Geist | 400 | 15px / interlineado 1.5 |
| Enunciado largo | Geist | 400 | 16px / 1.7, máx. 68ch |
| KPI | Geist Mono | 500 | 28px |
| Tiempos, conteos | Geist Mono | 400–500 | 12–13px |
| Código | Geist Mono | 400 | 13px / 1.75 |

### 1.3 Tokens de color
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | #F3F4F7 | #0F1115 | Fondo de la app |
| `--card` | #FFFFFF | #171A20 | Tarjetas |
| `--sunk` | #F5F6F9 | #1E222A | Campos, bloques hundidos, canvas del grafo |
| `--ink` | #15171C | #EEF0F4 | Texto principal |
| `--ink2` | #3A3F4B | #C9CDD6 | Texto secundario |
| `--muted` | #5F6573 | #9AA0AD | Texto terciario (≥ 4.5:1) |
| `--line` | #E7E9EF | #2A2F38 | Bordes y divisores |
| `--track` | #ECEEF3 | #2A2F38 | Fondo de barras |
| `--accent` | #2F5BEA | #7E9BF5 | Estado activo, enlaces, "completado"/"dominado" |
| `--accent-2` | #7D97F1 | #4F6FD8 | "En curso"/"visto" |
| `--accent-3` | #C9D4FA | #2E3F78 | Serie terciaria |
| `--accent-soft` | #EDF1FE | #1E2747 | Fondo de chip activo |
| `--sel` | #F2F5FE | #1B2236 | Fila seleccionada, hover |
| `--primary` | #15171C | #EEF0F4 | Botón principal (grafito) |
| `--hero` | #15171C | #22252D | Tarjeta "Challenge en curso" |
| `--st-no` | #A3A9B5 | #5B6270 | "No visto"/"pendiente" |
| `--seg-no` | #DDE0E7 | #343A45 | Segmento de etapa pendiente |
| `--edge` | #C9CDD6 | #3A404B | Aristas del grafo |
| `--d1-fg/--d1-bg` | verde | verde | Dificultad Básico |
| `--d2-fg/--d2-bg` | ámbar | ámbar | Dificultad Intermedio y estado "con fallos" |
| `--d3-fg/--d3-bg` | rosa | rosa | Dificultad Avanzado |

> **[DECISIÓN ABIERTA]** El ámbar se comparte entre "Intermedio" y "con fallos". Si resulta ambiguo en uso real, usar un rojo propio (`--fail`).

### 1.4 Paleta de estados (común a Challenge actual, Repaso y Grafo)
| Estado de etapa | Estado de concepto | Color | Etiqueta |
|---|---|---|---|
| Pendiente | No visto | `--st-no` | "Pendiente"/"No visto" |
| En curso | Visto | `--accent-2` | "En curso"/"Visto" |
| Completada | Dominado | `--accent` | "Completada"/"Dominado" |
| Con fallos | Con fallos | `--d2-fg` | "Con fallos" |

Regla: el color siempre va con texto. Nunca se comunica un estado solo con color.

### 1.5 Forma, espacio y sombra
- Radio: tarjetas 16px, botones/campos 10–12px, chips 7–8px, tiles de icono 9px.
- Sombra de tarjeta: `0 0 0 1px #E7E9EF, 0 1px 2px rgba(16,24,40,.04), 0 4px 14px -6px rgba(16,24,40,.08)`. En oscuro, solo el borde.
- Espaciado: grid de 4px; separación entre tarjetas 20px; padding interno 20–32px.
- Ancho máximo del contenido: 1320px. Barra lateral: 240px.
- Objetivo táctil mínimo: 44×44px.

---

## 2. Componentes compartidos

| Componente | Descripción | Variantes |
|---|---|---|
| Tile de dominio | Cuadrado de 32px con icono del dominio | `monocromo` (tablas/listas) / `color` (encabezados) |
| Chip de dificultad | Texto + 1–3 barras | Básico (verde,1) / Intermedio (ámbar,2) / Avanzado (rosa,3) |
| Chip Bloom | Neutro con borde, "B3 Aplicar" | B1–B6 |
| Chip de estado | Punto de color + texto | Pendiente/En curso/Completada/Con fallos |
| Chip de tiempo | Monoespaciado con borde | "25 min" |
| Barra de etapas | Segmentos de 6px, uno por etapa | 18px (tabla) / 28px (preview) / 32px (detalle) / flexible (tarjeta oscura); siempre con texto "N de M etapas completas" |
| Control segmentado | Grupo de radios | Apoyo (por etapa), Periodo, Vista de cola, Formato de entrega |
| Chip de filtro con conteo | Botón con contador | Activo grafito / inactivo con borde |
| Tarjeta KPI | Etiqueta, valor, barra fina, línea de contexto | — |
| Línea de lectura | Frase que interpreta el gráfico | Obligatoria en toda tarjeta de Analítica |
| Estado vacío | Icono, título, texto, CTA opcional | Borde discontinuo |
| Panel lateral fijo (sticky) | Detalle del ítem seleccionado | Preview de challenge, refuerzo, nodo del grafo |
| Etiqueta "Datos de ejemplo" | Chip discontinuo en el pie | Solo mientras se usen datos sintéticos |
| Tooltip de gráfico | Fondo #15171C, texto blanco | Fecha, etapa, real, estimado |

---

## 3. Navegación

```
[logo]
Inicio
Challenges
Challenge actual
Repaso
Grafo de conocimiento
Analítica
---
[usuario]
```

Barra lateral de 240px en escritorio (≥1280px); por debajo de 860px pasa a barra de pestañas inferior de 68px con etiquetas cortas (logo y usuario se ocultan).

---

## 4. Pantallas

### 4.1 Inicio
- Encabezado: fecha larga, "Hola, {nombre}", "Semana {n} · {x} de {y} etapas completadas".
- Tarjeta "Challenge en curso" (grafito): progreso por etapa (●●●○), barra de etapas con título de cada una, "Siguiente: {etapa} · {min}", botón "Continuar challenge". Variante sin challenge activo: recomendado + "Iniciar nuevo challenge".
- 4 KPIs (2×2): Racha, Etapas completadas, Tiempo medio real/etapa, Nivel actual.
- Tiempo real vs. estimado (30 días), línea con tooltip, enlace a Analítica.
- Tus debilidades activas: top 3 de la cola de repaso, con botón "Practicar".
- Etapas por dominio esta semana: barras apiladas por dominio.
- Calendario mensual con racha.
- Actividad reciente.
- Estados: usuario nuevo (todo en 0, CTA inicial), sin challenge en curso, racha rota, carga (esqueletos).

### 4.2 Challenges
- Filtros: Dominio, Dificultad, Nivel cognitivo, Estado.
- Tabla: Challenge (título + dataset), Dominios (tiles), Dificultad (chip), Progreso por etapas, Tiempo total.
- Vista previa lateral fija: lista de etapas expandible, cada una con chip de dominio/Bloom/estado; al expandir, descripción/dificultad/tiempo/tipo/conceptos. CTA según estado.
- Filtrar por Dominio o Bloom incluye el challenge si alguna etapa cumple la condición. Orden por defecto: en curso → pendientes recomendados → completados.

### 4.3 Challenge actual
- Encabezado: título, tiles de dominios, dificultad, tiempo total, progreso por etapas.
- Enunciado del challenge + esquema de datos.
- Una tarjeta por etapa: cabecera (número, título, tile+dominio, dificultad, chip Bloom, tiempo, estado, chevron) con el control **Apoyo** (Guiado/Pistas/Autónomo) propio de esa etapa a la derecha. La etapa activa tiene anillo de acento de 2px.
- Cuerpo al expandir: descripción; según Apoyo (Guiado→paso sugerido, Pistas→botón "Ver pista", Autónomo→nota "sin pistas"); conceptos para investigar (chips con estado del grafo, clic abre el grafo); entregables numerados.
  - Variante código: bloque "Verificación", botón "Verificar etapa", resultado pass/fail con detalle.
  - Variante conceptual: textarea + botón "Evaluar respuesta", resultado Correcta/Parcial + feedback.
  - Solución colapsada: "Revélala después de verificar tu intento".
- Preguntas de negocio del challenge (3–5).
- Columna lateral fija: formulario de entrega (Pegar/Subir/Enlace), tiempo real, "¿Dónde te trabaste?" (5 chips), botón "Registrar etapa".
- Reglas: varias etapas pueden estar abiertas a la vez; se puede saltar a cualquier etapa (sin bloqueo por orden); revelar solución antes de verificar marca "con ayuda" (R7).

### 4.4 Repaso
- Encabezado + control "Por prioridad / Por motivo".
- Chips de filtro por motivo con conteo.
- Leyenda de estado del grafo.
- Cola: tile de dominio, tema, "Etapa N · {etapa} — {challenge}", motivo, chip de estado, última práctica, prioridad, botón "Practicar".
- Panel lateral: reto de refuerzo (botón "Generar reto de refuerzo" → título, dificultad -1, tiempo -5min, apoyo sugerido Pistas); conceptos por investigar con checklist de progreso.
- Vacío: "Todavía no hay conceptos para repasar" + enlace a Challenges.

### 4.5 Grafo de conocimiento — corrección obligatoria sobre el PRD original

- Encabezado + subtítulo ("~300 conceptos en 6 dominios" o "{n} conceptos en {dominio}").
- Buscador (hasta 7 resultados, ignora tildes/mayúsculas).
- Chips de los 6 dominios con conteo — **actúan como atenuador/filtro, nunca como condición de visibilidad.**
- **Al abrir, sin selección de dominio: se muestran los nodos de los 6 dominios simultáneamente** (R15). El PRD original especificaba un estado vacío "elige un dominio para explorar" — eso queda sustituido por esta regla.
- Canvas (540px alto, fondo `--sunk`): nodos con radio/color según estado, aristas de prerrequisito, disposición por capas de izquierda a derecha, zoom 0.5×–2.5×, pan, leyenda fija.
- Panel lateral fijo: sin nodo → "Selecciona un concepto" + conteo por estado; con nodo → tile+dominio, nombre, nivel actual, Bloom máximo con evidencia, prerrequisitos (navegables, incluso de otro dominio), challenges/etapas relacionadas, evidencias, conceptos relacionados (máx. 8).
- Accesibilidad: cada nodo `role="button"`, enfocable con Tab, activable con Enter/Espacio, `aria-label` con el estado.

### 4.6 Analítica
- Encabezado + rango + selector 7/30/90 días.
- Tiempo real vs. estimado (línea + línea de lectura).
- Tendencia de debilidades (3 bloqueos más frecuentes, delta vs. periodo anterior).
- Brechas por dominio (barra apilada con evidencia reciente/sin evidencia, botón "Ver en el grafo").
- Etapas por dominio (barras apiladas por Apoyo).
- Rendimiento por dificultad (tabla acumulada desde el inicio).
- Actividad por día (heatmap, 4 niveles + vacío).
- Cada tarjeta tiene una línea de lectura generada a partir de los datos (ver §6).

---

## 5. Estados globales

| Estado | Patrón |
|---|---|
| Carga inicial | Esqueletos con la forma final de cada tarjeta |
| Carga parcial | Solo la zona que cambia muestra esqueleto |
| Vacío | Componente "Estado vacío" con CTA hacia la acción que genera datos |
| Error de verificación/evaluación | "No pudimos verificar tu entrega. Inténtalo de nuevo." en el bloque de resultado |

*(Se excluyen del alcance: "error de red" entre cliente y API remota, y "sesión caducada" — no hay red remota ni sesión en esta arquitectura.)*

---

## 6. Fórmulas de lógica visual (líneas de lectura y estados derivados)

Estas fórmulas determinan qué texto/color se muestra; la lógica de negocio completa vive en `SDD.md` (R1–R16, §11 adoptado del PRD).

| Tarjeta | Plantilla de línea de lectura |
|---|---|
| Tiempo real vs. estimado | "Tu tiempo real bajó de ~{a} min a ~{b} min en {P} días; {ya está cerca del estimado \| sigue {d} min por encima}." |
| Tendencia de debilidades | "{bloqueo} es el bloqueo más frecuente: {x} de {total} en {P} días." |
| Brechas | "{dominio} tiene la mayor brecha: {x} de {y} conceptos sin evidencia en 30 días." |
| Etapas por dominio | "{dominio} es el dominio que más practicaste ({x} de {total})." |
| Dificultad | "{dificultad} es donde más te desvías: {±n} min sobre lo estimado." |
| Actividad | "Practicaste {d} de {P} días. Racha más larga del periodo: {r} días." |

---

## 7. Accesibilidad (buena práctica, no gate de aceptación)

- Contraste ≥4.5:1; objetivos táctiles ≥44×44px.
- Semántica: `nav` con `aria-current`, tablas con `th scope`, segmentados como `radiogroup`, filtros como `aria-pressed`, pestañas como `tablist`/`tab`, expandibles con `aria-expanded`.
- Todo operable con teclado; foco visible (anillo de 2px).
- Color nunca es el único portador de estado (siempre + texto).
- Respetar `prefers-reduced-motion`.

---

## 8. Responsive

| Ancho | Cambios |
|---|---|
| ≥1280px | Barra lateral 240px; columnas + panel lateral fijo |
| 860–1279px | Tarjetas a ancho completo según flex-basis; paneles fijos si caben |
| <860px | Barra de pestañas inferior 68px; paneles bajo el contenido; tabla con scroll horizontal; grafo a ancho completo con pan táctil |
| <420px | KPIs en una columna; barra de etapas en 2 filas |

---

## 9. Rendimiento (único objetivo que sobrevive del PRD original)

- Grafo: 60fps de pan/zoom con hasta 300+ nodos (el grafo real de este proyecto tendrá ~250–380 Concept nodes, más que el estimado original del PRD).

---

## 10. Iconografía

- Un único set de trazo de 1.5px (recomendado: Lucide o Phosphor Light) para navegación, chevrons, check/cruz, ojo/ojo-tachado, subir/buscar/zoom, flechas de tendencia, reloj/alerta.
- Tiles de dominio con logos reales monocromo+color: PostgreSQL (SQL), Python, scikit-learn (ML), pandas (Limpieza); glifo propio de trazo para Matemáticas y Business Analytics.
- Sin ilustraciones, sin emojis, sin iconos de colores por tipo de reto.