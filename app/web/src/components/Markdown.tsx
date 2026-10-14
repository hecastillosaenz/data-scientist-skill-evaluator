import { Fragment, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import sql from 'highlight.js/lib/languages/sql';
import python from 'highlight.js/lib/languages/python';
import 'katex/dist/katex.min.css';
import styles from './Markdown.module.css';

interface Props {
  children: string;
  /** Sin párrafos envolventes: para ítems de lista y frases cortas. */
  inline?: boolean;
  className?: string;
}

const inlineComponents: ComponentProps<typeof ReactMarkdown>['components'] = { p: ({ children }) => <Fragment>{children}</Fragment> };

/**
 * Markdown del contenido de los challenges: GFM, fórmulas LaTeX (`$…$` y `$$…$$`, KaTeX local)
 * y resaltado de SQL/Python. Escapa los signos de moneda como `\$` para que no se lean como fórmula.
 */
export function Markdown({ children, inline = false, className = '' }: Props) {
  return (
    <div className={`${styles.md} ${inline ? styles.inline : ''} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { languages: { sql, python }, detect: false }]]}
        components={inline ? inlineComponents : undefined}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
