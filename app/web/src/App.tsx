import { BrowserRouter, Route, Routes } from 'react-router';
import { DataProvider } from './data/DataContext';
import { AppShell } from './layout/AppShell';
import { Agentes } from './screens/Agentes';
import { Analitica } from './screens/Analitica';
import { ChallengeActual } from './screens/ChallengeActual';
import { Challenges } from './screens/Challenges';
import { Debilidad } from './screens/Debilidad';
import { Grafo } from './screens/Grafo';
import { Inicio } from './screens/Inicio';
import { Objetivos } from './screens/Objetivos';
import { Repaso } from './screens/Repaso';
import { GeneratorProvider } from './screens/generate/GenerateDialog';

export function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <GeneratorProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Inicio />} />
            <Route path="challenges" element={<Challenges />} />
            <Route path="challenge-actual/:id?" element={<ChallengeActual />} />
            <Route path="repaso" element={<Repaso />} />
            <Route path="debilidad/:conceptId" element={<Debilidad />} />
            <Route path="grafo" element={<Grafo />} />
            <Route path="analitica" element={<Analitica />} />
            <Route path="objetivos" element={<Objetivos />} />
            <Route path="agentes" element={<Agentes />} />
          </Route>
        </Routes>
        </GeneratorProvider>
      </BrowserRouter>
    </DataProvider>
  );
}
