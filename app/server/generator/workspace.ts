import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { PendingGeneration } from '../../shared/generate';
import type { Cell, TestQuestion } from '../../shared/types';
import { writeFileAtomic } from '../atomic-write';
import { challengesDir } from '../paths';
import type { ChallengePlan } from './plan';

/** Lo que el Generador propone en la fase 1 (SDD R39): todo lo creativo; lo que fija el plan lo escribe el orquestador. */
export interface Skeleton {
  title: string;
  dataset: string;
  objectives: { lookingFor: string; outcomes: string[]; skills: string[] };
  scenario: string;
  task: string;
  data: { engine: 'duckdb'; tables: { name: string; description?: string; columns: { name: string; type: string; pk?: boolean; fk?: { table: string; column: string }; nullable?: boolean }[]; rowCount: number; sampleRows: Cell[][] }[]; seedSql: string };
  businessQuestions: { text: string; reflectionGuide?: string }[];
  stages: { number: number; title: string; description: string; estimatedMinutes: number; conceptIds?: string[] }[];
}

/** `estado.json`: lo ya validado, para que «Reintentar» retome desde la última fase válida sin pagarlo otra vez (R39). */
export interface GenerationState {
  version: 1;
  createdAt: string;
  plan: ChallengePlan;
  skeleton?: Skeleton;
  /** Contenido de cada etapa validada, por número. */
  stages: Record<string, unknown>;
  finalTest?: TestQuestion[];
  completed: string[];
  spentUsd: number;
}

/** Área de trabajo: `challenge/.generando/` (ignorada por git). Nada llega a `challenge/` hasta publicar. */
export const workRoot = (repoRoot: string): string => path.join(challengesDir(repoRoot), '.generando');
export const workDir = (repoRoot: string, challengeId: string): string => path.join(workRoot(repoRoot), challengeId);
const statePath = (repoRoot: string): string => path.join(workRoot(repoRoot), 'estado.json');

export async function readGenerationState(repoRoot: string): Promise<GenerationState | null> {
  try {
    const parsed = JSON.parse(await readFile(statePath(repoRoot), 'utf8')) as GenerationState;
    return parsed?.version === 1 && parsed.plan ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeGenerationState(repoRoot: string, state: GenerationState): Promise<void> {
  await mkdir(workRoot(repoRoot), { recursive: true });
  await writeFileAtomic(statePath(repoRoot), `${JSON.stringify(state, null, 2)}\n`);
}

/** «Detener» o un fallo sin remedio: borra el área de trabajo entera (R39c). */
export async function discardWork(repoRoot: string): Promise<void> {
  await rm(workRoot(repoRoot), { recursive: true, force: true });
}

const ageHours = (state: GenerationState, now: Date) => (now.getTime() - Date.parse(state.createdAt)) / 3_600_000;

/** Trabajo conservado que se puede retomar: existe y no superó las horas de conservación. */
export async function pendingGeneration(repoRoot: string, keepHours: number, now: Date): Promise<PendingGeneration | null> {
  const state = await readGenerationState(repoRoot);
  if (!state || ageHours(state, now) > keepHours || state.completed.length === 0) return null;
  return { challengeId: state.plan.id, completed: state.completed, ageHours: Math.round(ageHours(state, now) * 10) / 10 };
}

export const isStale = (state: GenerationState, keepHours: number, now: Date): boolean => ageHours(state, now) > keepHours;

export class PublishError extends Error {}

/** Publica con un `rename` (atómico en el mismo disco) y nunca sobrescribe un challenge existente. */
export async function publish(repoRoot: string, challengeId: string): Promise<string> {
  const target = path.join(challengesDir(repoRoot), challengeId);
  if (existsSync(target)) throw new PublishError(`Ya existe «challenge/${challengeId}/»; no lo sobrescribo.`);
  await rename(workDir(repoRoot, challengeId), target);
  await rm(workRoot(repoRoot), { recursive: true, force: true });
  return target;
}
