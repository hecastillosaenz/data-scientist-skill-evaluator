import { BrowserRouter, Route, Routes } from 'react-router';
import { DataProvider } from './data/DataContext';
import { AppShell } from './layout/AppShell';
import { Analitica } from './screens/Analitica';
import { ChallengeActual } from './screens/ChallengeActual';
import { Challenges } from './screens/Challenges';
import { Debilidad } from './screens/Debilidad';
import { Grafo } from './screens/Grafo';
import { Inicio } from './screens/Inicio';
import { Repaso } from './screens/Repaso';

export function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Inicio />} />
            <Route path="challenges" element={<Challenges />} />
            <Route path="challenge-actual/:id?" element={<ChallengeActual />} />
            <Route path="repaso" element={<Repaso />} />
            <Route path="debilidad/:conceptId" element={<Debilidad />} />
            <Route path="grafo" element={<Grafo />} />
            <Route path="analitica" element={<Analitica />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}
