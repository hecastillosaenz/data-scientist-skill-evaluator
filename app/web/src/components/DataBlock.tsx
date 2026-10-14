import { useState } from 'react';
import type { Dataset } from '../../../shared/types';
import { DataPreview } from './DataPreview';
import { Markdown } from './Markdown';
import { SchemaDiagram } from './SchemaDiagram';
import { Segmented } from './Segmented';

type View = 'diagrama' | 'tablas' | 'codigo';

/** Bloque «Datos» del enunciado: diagrama relacional, filas de muestra y el seed (UI-UX §4.3). */
export function DataBlock({ data }: { data: Dataset }) {
  const [view, setView] = useState<View>('diagrama');
  const seed = data.seedSql ?? data.seedPython;
  const options: { value: View; label: string }[] = [
    { value: 'diagrama', label: 'Diagrama' },
    { value: 'tablas', label: 'Tablas' },
    ...(seed ? [{ value: 'codigo' as const, label: data.seedSql ? 'SQL' : 'Python' }] : []),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Segmented label="Vista de los datos" hideLabel options={options} value={view} onChange={setView} />
      {view === 'diagrama' && <SchemaDiagram tables={data.tables} />}
      {view === 'tablas' && <DataPreview data={data} />}
      {view === 'codigo' && seed && <Markdown>{`\`\`\`${data.seedSql ? 'sql' : 'python'}\n${seed}\n\`\`\``}</Markdown>}
    </div>
  );
}
