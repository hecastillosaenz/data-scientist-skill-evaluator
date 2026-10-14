import type { Challenge, Dataset, StageContent } from '../../../../../shared/types';
import phishing from './phishing.json';
import rfm from './rfm.json';
import seguros from './seguros.json';

interface RfmPatch {
  scenario: string;
  task: string;
  data: Dataset;
  stage1: { description: string; content: StageContent };
}

/**
 * Contenido completo de ejemplo, basado en retos verificados del autor (su Notion): se añaden dos challenges
 * y se enriquece la etapa 1 del RFM. Las expectativas de SQL se comprobaron con SQLite al generarlos (R19).
 * Las demás etapas conservan el contenido mínimo.
 */
export function enrichChallenges(base: Challenge[]): Challenge[] {
  const patch = rfm as unknown as RfmPatch;
  const enriched = base.map((c) =>
    c.id !== 'c006'
      ? c
      : {
          ...c,
          scenario: patch.scenario,
          task: patch.task,
          data: patch.data,
          stages: c.stages.map((s) =>
            s.number !== 1 ? s : { ...s, description: patch.stage1.description, content: patch.stage1.content },
          ),
        },
  );
  return [...enriched, seguros as unknown as Challenge, phishing as unknown as Challenge];
}
