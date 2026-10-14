# UI/UX — data-scientist-skill-evaluator

> Especificación visual autocontenida, adaptada del PRD "Plataforma de retos data science" v1.0 para la arquitectura local-first de este proyecto (ver `SDD.md` §7.1 para el detalle de qué se adoptó, adaptó o excluyó de cada sección del PRD original). Sin autenticación, sin multiusuario, sin backend HTTP — toda referencia a "API" se resuelve contra el orquestador local.

---

## 1. Sistema visual

### 1.1 Principios
- Base neutra con tarjetas elevadas y un único color de acento. Dos temas (claro y oscuro) más «sistema»; **el tema por defecto es claro**, con selector en la barra lateral.
- Color semántico solo para dificultad y para el estado "con fallos".
- Monoespaciada solo para números, tiempos y código.
- Sin emojis ni ilustraciones de personajes.

### 1.2 Tipografía
Regla de jerarquía: **un título siempre pesa más (tamaño, peso o color) que el texto que encabeza**. Las etiquetas de sección no pueden ser más pequeñas ni más tenues que el cuerpo.

| Uso | Fuente | Peso | Tamaño | Color |
|---|---|---|---|---|
| H1 de pantalla | Geist | 600 | clamp(26px, 2.6vw, 32px) | `--ink` |
| H1 del challenge | Geist | 600 | clamp(28px, 3vw, 36px) | `--ink` |
| H2 de tarjeta | Geist | 600 | 20px | `--ink` |
| H3 de sección dentro de tarjeta | Geist | 600 | 15px | `--ink` |
| Etiqueta de campo / metadato | Geist | 500 | 13px | `--muted` |
| Cuerpo | Geist | 400 | 15px / 1.6 | `--ink2` |
| Enunciado largo | Geist | 400 | 15px / 1.7, máx. 68ch | `--ink2` |
| KPI | Geist Mono | 500 | 28px | `--ink` |
| Tiempos, conteos | Geist Mono | 400–500 | 12–13px | — |
| Código | Geist Mono | 400 | 13px / 1.75 | — |

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

> Los valores de la tabla se aplican por tema con `data-theme="light" | "dark"` en `<html>`; el tema «sistema» resuelve a uno de los dos según `prefers-color-scheme`.

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
- **Sin anillos en ninguna cuadrícula**: ni tarjetas, ni chips, ni campos, ni diagramas llevan contorno de 1px; se distinguen por fondo y sombra. Los divisores *dentro* de listas y tablas sí se mantienen, y el anillo de foco (accesibilidad) se conserva.
- **Tarjetas sin anillo** (un borde gris uniforme se ve genérico): se elevan por sombra y por contraste con el fondo. Claro: `0 1px 2px rgba(16,24,40,.04), 0 10px 28px -12px rgba(16,24,40,.14)`. Oscuro: la tarjeta es un tono más clara que el fondo, con `inset 0 1px 0 rgba(255,255,255,.04)` y una sombra profunda. Los divisores *dentro* de una tarjeta sí usan `--line`.
- **La etapa desplegada** se enfatiza cambiando el sombreado de forma gradual (transición de ~300 ms): un velo suave de acento en la parte superior y algo más de elevación; no hay barra lateral ni anillo.
- **Texto y bloques.** El texto largo va **justificado** (con guionado automático en español). El contenido de enunciados, etapas y guías se compone en una **columna de lectura centrada** (≈ 800 px): párrafos, código, tablas y diagramas ocupan el mismo ancho y las tablas se centran. Nada queda pegado a la izquierda con espacio vacío a la derecha.
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
| Etiqueta "Datos de ejemplo" | Chip discontinuo en el pie | Solo con `?datos=ejemplo` (R36); nada de lo que se haga se guarda |
| Aviso de guardado fallido | Barra fija arriba con el error y «Cerrar» | Cuando el orquestador no guarda un registro (R37); el cambio se revierte y lo escrito se conserva |
| Cronómetro del challenge | Píldora fija arriba a la derecha con `mm:ss` mono y Iniciar/Pausar; detalle (challenge, vuelta actual, reiniciar) en su menú | Uno por challenge y solo uno en marcha: en Challenge actual muestra el de ese challenge; en otras pantallas, el que corre (con enlace a su challenge). Al volver de una ausencia muestra el diálogo de intervalo (R30) |
| Objetivo del reto | Bloque con «Qué busca este reto», «Al terminar tendrás» y «Habilidades» | En el enunciado, antes de los datos |
| Ventana de debilidad | Página con diagnóstico, evidencia, causas raíz, error común y plan de mejora | Se abre desde Inicio y Repaso |
| Diagrama relacional | Tarjetas de tabla con columnas, tipos, PK/FK y conectores con cardinalidad 1–N | Con lista de relaciones en texto accesible |
| Vista previa de datos | Pestañas por tabla con filas de muestra y `NULL` en gris cursivo | "8 de 8 filas", copiar SQL |
| Panel de verificación | Línea de tiempo en vivo, salida colapsable, feedback en Markdown y resultado | Estados: en curso, correcto, con fallos, error; botón Detener |
| Tooltip de gráfico | Fondo #15171C, texto blanco | Fecha, etapa, real, estimado |

---

## 3. Navegación

```
[logo «DS» + Data Scientist Challenges]
Inicio
Challenges
Challenge actual
Repaso
Grafo de conocimiento
Analítica
Objetivos
Agentes
---
[selector de tema: Claro · Oscuro · Sistema]
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
- **Generar nuevo challenge (R1, R38, R39).** Botón en la cabecera (y «Generar uno nuevo» en Inicio) que abre un diálogo: dominio opcional (por defecto «Recomendado por mi grafo»), el plan que calculó el orquestador (rol, conceptos, Bloom, dificultad y Apoyo de cada etapa) y, si quedó trabajo sin terminar, «Retomar». Al generar muestra la línea de tiempo por fases con «Detener»; al terminar, «Abrir challenge». Si falla: el motivo con el campo, «Reintentar desde <fase>» y, si fue por presupuesto, «Reintentar con el doble de presupuesto». Solo con datos reales: con `?datos=ejemplo` explica que no está disponible.

### 4.3 Challenge actual
- Encabezado: título, tiles de dominios, dificultad, tiempo total, progreso por etapas.
- **Objetivo del reto** (R28): qué busca el challenge, qué obtendrás al terminar y qué habilidades entrena.
- **Enunciado** (Markdown con fórmulas): escenario de negocio (rol, organización, decisión) y tarea concreta. Bloque **Datos** con pestañas *Diagrama* (relacional), *Tablas* (filas de muestra) y *SQL* (seed).
- Una tarjeta por etapa: cabecera (número, título, tile+dominio, dificultad, chip Bloom, tiempo objetivo, estado, chevron) y el control **Apoyo** (Guiado/Pistas/Autónomo) propio de esa etapa. **No hay cronómetro por etapa**: el cronómetro es global (R20). Al desplegarse, la tarjeta cambia su sombreado gradualmente.
- Cuerpo al expandir, según el Apoyo (R17):
  - *Guiado*: teoría aplicada (con fórmulas), ejemplo resuelto en otro dominio, paso a paso y esqueleto de código.
  - *Pistas*: pistas ordenadas (qué, no cómo; se pueden mostrar y ocultar) y conceptos para investigar.
  - *Autónomo*: solo conceptos y entregable.
  - Siempre: conceptos para investigar (con búsquedas en español e inglés; clic abre el grafo), entregable como checklist con el resultado esperado, y «Cómo marcar el resultado».
  - Variante código: botón **Verificar etapa** y, debajo, el **panel de verificación** (R26): línea de tiempo en vivo (buscar celda → ejecutar → comparar → analizar), salida colapsable, feedback en Markdown, resultado y Detener/Reintentar.
  - Variante conceptual: textarea + **Evaluar respuesta**, con el mismo panel.
  - Solución colapsada por secciones; revelarla marca «Con ayuda» de forma permanente aunque luego se oculte.
- **Preguntas de negocio** (3–5): un campo por pregunta, «Guardar respuestas» y, solo después, la guía de reflexión (R22).
- **Test final de retención** (R21): tarjeta bloqueada hasta completar las etapas; al calificar muestra aciertos, explicaciones y conceptos a reforzar.
- Columna lateral fija **Registro de la etapa** (sustituye a «Entrega»; ya no hay Pegar/Subir/Enlace porque la resolución ocurre en el notebook de VS Code): el **tiempo de esta vuelta** (desde el último registro; de solo lectura, «Editar» lo marca manual) frente al objetivo de la etapa, «¿Dónde te trabaste?» (5 chips), notas y «Registrar etapa».
- Reglas: varias etapas pueden estar abiertas a la vez; se puede saltar a cualquier etapa (sin bloqueo por orden); revelar la solución antes de verificar marca «con ayuda» (R7); cada challenge tiene su propio cronómetro y cada registro toma el tiempo desde el anterior de ese challenge.

**Intentos de la etapa (R54).** Bajo el panel de verificación de los challenges reales, un desplegable «Intentos de esta etapa» con el número de intentos y cuántos quedaron sin aprobar. Cada fila (más reciente primero): `#n`, chip de resultado, el fallo («Error de Python · KeyError: 'precio'») y la hora; al abrirla se ve tu código o respuesta de ese momento y el feedback del Evaluador. Aviso fijo: no cuentan como resultado oficial (eso es «Registrar etapa»). Los datos de ejemplo no muestran intentos.

### 4.4 Repaso
- Encabezado + control "Por prioridad / Por motivo".
- Chips de filtro por motivo con conteo.
- Leyenda de estado del grafo.
- Cola: tile de dominio, tema, "Etapa N · {etapa} — {challenge}", motivo, chip de estado, última práctica, prioridad, botón "Practicar".
- Cada fila abre la **ventana de debilidad** (R31): diagnóstico («en qué estás fallando»), evidencia cronológica, causas raíz (prerrequisitos débiles), error común del caso, plan de mejora con pasos y búsquedas, y el reto de refuerzo.
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

### 4.5b Grafo unificado (second brain) — implementado
- Segunda vista de la pantalla de Grafo, con selector **Conceptos | Second brain**.
- Muestra juntos cinco tipos de nodo: **conceptos** (punto, color según estado), **challenges** (cuadrado), **etapas** (rombo), **tests** (triángulo) y **mejoras** (debilidades abiertas, círculo marcado). Aristas: prerrequisito, challenge→etapa, etapa→concepto que practica, test→concepto y mejora→concepto.
- Disposición por fuerzas (determinista): los conceptos de un tema se agrupan y los challenges quedan entre los conceptos que practican, así se ve cómo interactúa todo.
- Chips por tipo y por dominio **atenúan, no ocultan** (R32). Buscador, zoom y pan como en la vista de conceptos.
- Panel lateral con el detalle del nodo y enlaces a la pantalla correspondiente (challenge, debilidad, test).

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

**Dónde fallo (R54).** Tarjeta de Analítica con las barras de intentos sin aprobar por tipo de fallo y por concepto (cada concepto enlaza a su ventana de debilidad), en el periodo elegido, y una línea de lectura con los intentos promedio hasta aprobar. Vacío: «Aún no hay intentos guardados en este periodo».

### 4.7 Objetivos *(propuesto, R44–R45)*
- Cabecera con tu **rol** (editable en línea) y un botón «Nuevo foco».
- Una tarjeta por foco: título, estado (Activo/Pausado/Logrado como `Segmented`), fechas, conceptos del grafo vinculados (chips con buscador), la **carpeta de material** del repo (campo `material/…` que muestra al instante los archivos que encontró, los omitidos con su motivo y avisos si no existe) y el **material en texto** en un área grande con contador frente a `materialMaxCaracteres`. Aviso: «El material se usa solo como contexto para generar tus retos».
- Máximo 3 focos activos (`focosActivosMax`): un foco nuevo nace en pausa si ya hay 3 y «Activo» no se ofrece hasta pausar otro. **Guardado explícito** (botón Guardar, con «Cambios sin guardar» y aviso al cerrar la pestaña) porque son textos largos; el orquestador valida el archivo completo y, si lo rechaza, muestra todos los motivos sin tocar lo guardado.
- Vacío: «Cuéntale al sistema qué estás estudiando para que tus retos se relacionen con ese material».

### 4.8 Agentes *(propuesto, R46–R48)*
- Fila superior: **cuatro tarjetas** (Generador, Evaluador de código, Evaluador conceptual, Analista) con estado (En ejecución con pulso / Inactivo), última ejecución, costo del día y acumulado.
- Debajo, a la izquierda, la **línea de tiempo** de ejecuciones (filtros por rol, resultado y challenge) y, a la derecha, el **detalle** de la seleccionada: entrada, eventos, salida, costo, error. Los **traspasos** de un challenge se muestran como una cadena de ejecuciones enlazadas, nunca como un chat.
- Sección «Últimos análisis» con lo que aplicó el Analista (observaciones, enlaces, candidatos) y «Errores recientes».
- Solo lectura: ningún botón lanza ni reintenta ejecuciones. Mientras haya una en curso, se actualiza sola.
- En el diálogo de generar (§4.2) se añade el campo **Tema** («¿Algo concreto? p. ej. descenso del gradiente») con sugerencias del grafo; sin tema, el plan muestra qué focos activos influyeron.

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