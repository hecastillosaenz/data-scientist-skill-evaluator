/** Extracción del JSON que devuelven los agentes (Generador y Analista). */

/**
 * Barras invertidas que JSON no admite (`\$`, `\_`, `\(`…): se duplican, porque el sentido es inequívoco. Las que sí son
 * escapes válidos (`\n`, `\t`, `\f`, `\b`…) no se tocan: ahí no se puede adivinar si se quería LaTeX (ver `suspicious`).
 */
export function fixInvalidEscapes(json: string): string {
  return json.replace(/\\(.)/gs, (m, c: string) => ('"\\/bfnrtu'.includes(c) ? m : `\\\\${c}`));
}

/** Caracteres de control que no pueden ser texto legítimo: señal de una barra invertida sin duplicar (`\frac` → salto de página + «rac»). */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

function suspicious(value: unknown, path = ''): string | null {
  if (typeof value === 'string') {
    const hit = CONTROL.exec(value);
    if (hit) {
      const around = value.slice(Math.max(0, hit.index - 20), hit.index + 20).replace(/[\u0000-\u001f]/g, '␟');
      return `${path || 'la respuesta'} contiene un carácter de control cerca de «${around}»: seguramente una barra invertida sin duplicar (en JSON, \\frac se escribe \\\\frac y \\$ se escribe \\\\$).`;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = suspicious(value[i], `${path}[${i + 1}]`);
      if (found) return found;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      const found = suspicious(v, path ? `${path}.${k}` : k);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Candidatos de JSON dentro de la respuesta. Un texto de Markdown dentro del JSON puede traer sus propios bloques
 * ```sql, así que el cierre del bloque ```json no es el primer ``` sino el último que deje un JSON válido: se prueban de
 * atrás hacia adelante, empezando por el último bloque ```json.
 */
function* candidates(text: string): Generator<string> {
  const starts = [...text.matchAll(/```json\s*/gi)].map((m) => ({ at: m.index!, body: m.index! + m[0].length }));
  const fences = [...text.matchAll(/```/g)].map((m) => m.index!);
  for (const start of starts.reverse()) {
    for (const end of fences.filter((f) => f >= start.body).reverse()) yield text.slice(start.body, end);
  }
  if (starts.length === 0) {
    yield text.trim();
    yield text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  }
}

/** Extrae el JSON de la respuesta (el último bloque ```json, o el objeto completo). Los errores dicen dónde y por qué. */
export function extractJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const hasBlock = /```json/i.test(text);
  let parseError = '';
  let suspect: string | null = null;
  for (const raw of candidates(text)) {
    for (const attempt of [raw, fixInvalidEscapes(raw)]) {
      try {
        const value = JSON.parse(attempt) as unknown;
        const problem = suspicious(value);
        if (!problem) return { ok: true, value };
        suspect ??= problem;
      } catch (err) {
        parseError ||= (err as Error).message;
      }
    }
  }
  if (suspect) return { ok: false, error: suspect };
  return { ok: false, error: hasBlock ? `El bloque \`\`\`json no es un JSON válido (${parseError}). Revisa comas, comillas, saltos de línea dentro de textos (usa \\n) y barras invertidas (se duplican).` : 'No encontré un bloque ```json con la respuesta.' };
}
