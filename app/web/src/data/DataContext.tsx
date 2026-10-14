import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Apoyo, AppData, Challenge, ChallengeStatus, Evidence, StageStatus } from '../../../shared/types';
import { computeInsights, type ConceptInsight } from '../domain/conceptState';
import { challengeStatus, stageStatuses } from '../domain/progress';
import { loadAppData, scenarioFromSearch } from './repository';

interface Actions {
  /** El Apoyo es independiente por etapa (R5). */
  setApoyo: (stageId: string, apoyo: Apoyo) => void;
  /** Evidence es append-only: nunca se sobrescribe un intento previo (R10). */
  addEvidence: (evidence: Omit<Evidence, 'id'>) => Evidence;
  startChallenge: (challengeId: string) => void;
}

interface AppState {
  loading: boolean;
  error: boolean;
  data: AppData | null;
  now: Date;
  insights: Map<string, ConceptInsight>;
  /** Apoyo vigente de cada etapa (sobrescribe el valor inicial del challenge). */
  apoyoOf: (stageId: string, initial: Apoyo) => Apoyo;
  challengeStatusOf: (challenge: Challenge) => ChallengeStatus;
  stageStatusesOf: (challenge: Challenge) => Map<string, StageStatus>;
  currentChallenge: Challenge | null;
  actions: Actions;
}

const Ctx = createContext<AppState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState(false);
  const [apoyos, setApoyos] = useState<Record<string, Apoyo>>({});
  const [started, setStarted] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    loadAppData(scenarioFromSearch(window.location.search))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const addEvidence = useCallback((partial: Omit<Evidence, 'id'>): Evidence => {
    const evidence: Evidence = { ...partial, id: `ev-${crypto.randomUUID().slice(0, 8)}` };
    setData((prev) => (prev ? { ...prev, evidence: [...prev.evidence, evidence] } : prev));
    return evidence;
  }, []);

  const actions = useMemo<Actions>(
    () => ({
      setApoyo: (stageId, apoyo) => setApoyos((prev) => ({ ...prev, [stageId]: apoyo })),
      addEvidence,
      startChallenge: (id) => setStarted((prev) => new Set(prev).add(id)),
    }),
    [addEvidence],
  );

  const insights = useMemo(
    () => (data ? computeInsights(data.concepts, data.challenges, data.evidence) : new Map<string, ConceptInsight>()),
    [data],
  );

  const value = useMemo<AppState>(() => {
    const evidence = data?.evidence ?? [];
    const challengeStatusOf = (c: Challenge) => challengeStatus(c, evidence, started.has(c.id));
    const current = data?.challenges.find((c) => challengeStatusOf(c) === 'en_curso') ?? null;
    return {
      loading: !data && !error,
      error,
      data,
      now: data ? new Date(data.now) : new Date(),
      insights,
      apoyoOf: (stageId, initial) => apoyos[stageId] ?? initial,
      challengeStatusOf,
      stageStatusesOf: (c) => stageStatuses(c, evidence, started.has(c.id)),
      currentChallenge: current,
      actions,
    };
  }, [data, error, insights, apoyos, started, actions]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp debe usarse dentro de <DataProvider>');
  return ctx;
}
