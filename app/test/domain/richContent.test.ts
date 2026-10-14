import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Markdown } from '../../web/src/components/Markdown';
import { buildChallenges } from '../../web/src/data/sample/challenges';
import { SAMPLE_CONCEPTS } from '../../web/src/data/sample/concepts';

const html = (md: string, inline = false) => renderToStaticMarkup(createElement(Markdown, { inline, children: md }));

describe('Markdown del contenido', () => {
  it('renderiza fórmulas LaTeX con KaTeX', () => {
    const out = html('Bayes: $P(F \\mid A)$\n\n$$\nP(A) = 0.067\n$$');
    expect(out).toContain('katex');
    expect(out).toContain('katex-display');
  });

  it('resalta SQL y Python', () => {
    expect(html('```sql\nSELECT 1 FROM t;\n```')).toContain('hljs-keyword');
    expect(html('```python\ndef f():\n    return 1\n```')).toContain('hljs-keyword');
  });

  it('un signo de moneda escapado no se lee como fórmula', () => {
    const out = html('Pagó \\$1,36 por cada \\$1 cobrado');
    expect(out).not.toContain('katex');
    expect(out).toContain('$1,36');
  });

  it('en modo inline no envuelve en párrafos', () => {
    expect(html('un `paso` corto', true)).not.toContain('<p>');
  });
});

describe('contenido rico de ejemplo', () => {
  const challenges = buildChallenges();
  const conceptIds = new Set(SAMPLE_CONCEPTS.map((c) => c.id));
  const stages = challenges.flatMap((c) => c.stages);

  it('incluye los retos completos del Notion', () => {
    const titles = challenges.map((c) => c.title);
    expect(titles).toContain('Seguros: siniestralidad por tipo de póliza');
    expect(titles).toContain('Filtro de phishing y probabilidad real de alerta');
  });

  it('los ids de concepto de la investigación existen en el grafo', () => {
    const missing = stages.flatMap((s) => (s.content.research ?? []).filter((r) => !conceptIds.has(r.conceptId)).map((r) => `${s.id}: ${r.conceptId}`));
    expect(missing).toEqual([]);
  });

  it('las llaves foráneas apuntan a tablas y columnas existentes', () => {
    for (const c of challenges) {
      const tables = new Map((c.data?.tables ?? []).map((t) => [t.name, t]));
      for (const t of tables.values()) {
        for (const col of t.columns) {
          if (!col.fk) continue;
          const target = tables.get(col.fk.table);
          expect(target, `${c.id}.${t.name}.${col.name}`).toBeDefined();
          expect(target!.columns.some((x) => x.name === col.fk!.column)).toBe(true);
        }
      }
    }
  });

  it('las filas de muestra tienen el mismo ancho que las columnas', () => {
    for (const c of challenges) for (const t of c.data?.tables ?? []) for (const row of t.sampleRows) expect(row).toHaveLength(t.columns.length);
  });

  it('las etapas de código con resultado esperado lo declaran con columnas y filas coherentes', () => {
    for (const s of stages) {
      const e = s.content.expected;
      if (!e) continue;
      for (const row of e.rows) expect(row).toHaveLength(e.columns.length);
    }
  });

  it('Seguros: la tabla esperada coincide con los totales verificados', () => {
    const s = stages.find((x) => x.id === 'c010-s1')!;
    expect(s.content.expected!.rows).toEqual([
      ['hogar', 2, 1100, 1500, 136.36],
      ['auto', 3, 3000, 1800, 60],
      ['salud', 3, 6000, 2600, 43.33],
    ]);
  });

  it('cada challenge sigue teniendo preguntas de negocio con id único', () => {
    const ids = challenges.flatMap((c) => c.businessQuestions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
