import { describe, expect, it } from 'vitest';
import { extractJson, fixInvalidEscapes } from '../server/generator/prompts';

const block = (json: string) => `Aquí va.\n\`\`\`json\n${json}\n\`\`\`\n`;

describe('extractJson (respuestas reales del Generador)', () => {
  it('lee el último bloque ```json', () => {
    expect(extractJson(`${block('{"a":1}')}\nY otra:\n${block('{"a":2}')}`)).toEqual({ ok: true, value: { a: 2 } });
  });

  it('un texto de Markdown con sus propios bloques ```sql dentro del JSON no corta la respuesta (caso real)', () => {
    const body = 'Consulta:\n\n```sql\nSELECT 1;\n```\n\nFin.';
    const r = extractJson(block(JSON.stringify({ workedExample: { domain: 'libros', body } })));
    expect(r).toEqual({ ok: true, value: { workedExample: { domain: 'libros', body } } });
  });

  it('acepta el objeto sin bloque', () => {
    expect(extractJson('{"a":"b"}')).toEqual({ ok: true, value: { a: 'b' } });
    expect(extractJson('Listo: {"a":"b"} fin')).toEqual({ ok: true, value: { a: 'b' } });
  });

  it('repara las barras invertidas que JSON no admite (\\$, \\_), sin tocar las válidas', () => {
    const r = extractJson(block('{"t":"Gasta 5 \\$ y \\_x_ vale \\\\frac y \\"citado\\""}'));
    expect(r).toEqual({ ok: true, value: { t: 'Gasta 5 \\$ y \\_x_ vale \\frac y "citado"' } });
    expect(fixInvalidEscapes('"\\$"')).toBe('"\\\\$"');
    expect(fixInvalidEscapes('"\\\\$"')).toBe('"\\\\$"'); // `\\` ya duplicada: queda igual
  });

  it('detecta LaTeX sin duplicar la barra (\\frac se vuelve salto de página) y dice dónde', () => {
    const r = extractJson(block('{"theory":[{"title":"x","body":"La razón es \\frac{a}{b}."}]}'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('theory[1].body');
      expect(r.error).toContain('barra invertida sin duplicar');
    }
  });

  it('un JSON roto devuelve la causa y no solo «inválido»', () => {
    const r = extractJson(block('{"a": 1,, "b": 2}'));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('no es un JSON válido (');
      expect(r.error).toContain('Revisa comas');
    }
  });

  it('sin bloque ni objeto lo dice', () => {
    const r = extractJson('Lo siento, no puedo.');
    expect(r).toEqual({ ok: false, error: 'No encontré un bloque ```json con la respuesta.' });
  });
});
