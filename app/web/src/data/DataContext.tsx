import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Apoyo, AppData, BusinessAnswer, Challenge, ChallengeStatus, Evidence, StageStatus, TestResult } from '../../../shared/types';
import { computeInsights, type ConceptInsight } from '../domain/conceptState';
import { challengeStatus, stageStatuses } from '../domain/progress';
import type { StatePayload } from '../../../shared/state';
import { loadAppState, progressApi, scenarioFromSearch, sourceFromSearch, type DataSource } from './repository';

interface Actions {
  /** El Apoyo es independiente por etapa (R5). */
  setApoyo: (stageId: string, apoyo: Apoyo) => void;
  /**
   * Evidence es append-only: nunca se sobrescribe un intento previo (R10). Se muestra al instante y se guarda en el
   * orquestador; si el guardado falla se revierte (R37) y devuelve `false` para que la pantalla conserve lo escrito.
   */
  addEvidence: (evidence: Omit<Evidence, 'id'>) => Promise<boolean>;
  startChallenge: (challengeId: string) => void;
  /** Respuestas de negocio: append-only (R22). */
  addBusinessAnswers: (challengeId: string, items: { questionId: string; text: string }[]) => Promise<boolean>;
  /** Resultados del test final: append-only (R21, R23). */
  addTestResults: (results: Omit<TestResult, 'id' | 'at'>[]) => Promise<boolean>;
  /** Cierra un aviso de la barra superior. */
  dismissNotice: (id: string) => void;
  /** Vuelve a leer el estado del orquestador (p. ej. tras generar un challenge nuevo). */
  reload: () => Promise<void>;
  /** «Analizar ahora» (R12): pide al orquestador analizar los registros pendientes y espera el resultado. */
  analyzePending: () => Promise<void>;
}

/** Aviso persistente de la barra superior: guardado fallido (R37), progreso ilegible (R33) o challenge inválido (R29). */
export interface Notice {
  id: string;
  kind: 'error' | 'warning';
  title: string;
  detail: string;
}

interface AppState {
  loading: boolean;
  /** Mensaje si no se pudo cargar el estado inicial. */
  error: string | null;
  /** `ejemplo` = datos sintéticos que no se guardan (R36). */
  source: DataSource;
  notices: Notice[];
  /** Estado del Analista: registros pendientes, análisis en curso y fallidos (R12, R42). */
  analysis: StatePayload['analysis'];
  /** Intentos guardados de todos los challenges (R51, R54). */
  attempts: StatePayload['attempts'];
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
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>('real');
  const [apoyos, setApoyos] = useState<Record<string, Apoyo>>({});
  const [started, setStarted] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Notice[]>([]);
  const [analysis, setAnalysis] = useState<StatePayload['analysis']>({ pending: [], running: false, failed: {} });
  const [attempts, setAttempts] = useState<StatePayload['attempts']>([]);
  const watching = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const wanted = sourceFromSearch(window.location.search);
    loadAppState(wanted, scenarioFromSearch(window.location.search))
      .then((loaded) => {
        if (cancelled) return;
        setSource(loaded.source);
        setData(loaded.data);
        setApoyos(loaded.apoyos);
        setStarted(new Set(loaded.started));
        setAnalysis(loaded.analysis);
        setAttempts(loaded.attempts);
        setNotices([
          ...loaded.problems.map((detail, i) => ({ id: `problem-${i}`, kind: 'error' as const, title: 'Progreso ilegible', detail })),
          ...loaded.invalid.map((c) => ({
            id: `invalid-${c.folder}`,
            kind: 'warning' as const,
            title: `${c.folder} no cumple el contrato y no se cargó`,
            detail: c.errors.slice(0, 3).join(' '),
          })),
        ]);
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'No pude cargar los datos.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const persisted = source === 'real';
  const fail = useCallback((what: string, err: unknown) => {
    const detail = err instanceof Error ? err.message : 'Error desconocido.';
    setNotices((prev) => [...prev.filter((n) => n.id !== 'save-error'), { id: 'save-error', kind: 'error', title: `No se guardó: ${what}`, detail }]);
  }, []);

  const reload = useCallback(async () => {
    if (!persisted) return;
    try {
      const loaded = await loadAppState('real', 'normal');
      setData(loaded.data);
      setApoyos(loaded.apoyos);
      setStarted(new Set(loaded.started));
      setAnalysis(loaded.analysis);
        setAttempts(loaded.attempts);
    } catch (err) {
      fail('la recarga de tus datos', err);
    }
  }, [persisted, fail]);

  /**
   * El Analista trabaja en segundo plano tras «Registrar etapa» (R12): se consulta su estado hasta que quede libre y
   * entonces se recarga para mostrar lo que observó. Un solo observador a la vez; nunca bloquea nada.
   */
  const watchAnalysis = useCallback(async () => {
    if (watching.current || !persisted) return;
    watching.current = true;
    setAnalysis((prev) => ({ ...prev, running: true }));
    try {
      for (let i = 0; i < 80; i++) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const status = await progressApi.getAnalysis();
        if (status.running === null && status.queued === 0) break;
      }
    } catch {
      /* si no se puede consultar, la recarga final deja el estado real */
    } finally {
      watching.current = false;
      await reload();
    }
  }, [persisted, reload]);

  // Guardado optimista (R37): se ve al instante; si el orquestador lo rechaza o no responde, se revierte y se avisa.
  const challengeOfStage = useCallback((stageId: string) => data?.challenges.find((c) => c.stages.some((s) => s.id === stageId))?.id, [data]);

  const addEvidence = useCallback(
    async (partial: Omit<Evidence, 'id'>): Promise<boolean> => {
      const evidence: Evidence = { ...partial, id: `ev-${crypto.randomUUID().slice(0, 8)}` };
      setData((prev) => (prev ? { ...prev, evidence: [...prev.evidence, evidence] } : prev));
      if (!persisted) return true;
      try {
        await progressApi.addEvidence(evidence);
        void watchAnalysis();
        return true;
      } catch (err) {
        setData((prev) => (prev ? { ...prev, evidence: prev.evidence.filter((e) => e.id !== evidence.id) } : prev));
        fail('el registro de la etapa', err);
        return false;
      }
    },
    [persisted, fail, watchAnalysis],
  );

  const actions = useMemo<Actions>(
    () => ({
      setApoyo: (stageId, apoyo) => {
        let previous: Apoyo | undefined;
        setApoyos((prev) => {
          previous = prev[stageId];
          return { ...prev, [stageId]: apoyo };
        });
        const challengeId = challengeOfStage(stageId);
        if (!persisted || !challengeId) return;
        progressApi.setApoyo(challengeId, stageId, apoyo).catch((err: unknown) => {
          setApoyos((prev) => {
            const next = { ...prev };
            if (previous) next[stageId] = previous;
            else delete next[stageId];
            return next;
          });
          fail('el cambio de Apoyo', err);
        });
      },
      addEvidence,
      startChallenge: (id) => {
        let was = false;
        setStarted((prev) => {
          was = prev.has(id);
          return new Set(prev).add(id);
        });
        if (!persisted || was) return;
        progressApi.start(id).catch((err: unknown) => {
          setStarted((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          fail('el inicio del challenge', err);
        });
      },
      addTestResults: async (results) => {
        const at = new Date().toISOString();
        const added: TestResult[] = results.map((r) => ({ ...r, id: `tr-${crypto.randomUUID().slice(0, 8)}`, at }));
        setData((prev) => (prev ? { ...prev, testResults: [...prev.testResults, ...added] } : prev));
        if (!persisted || added.length === 0) return true;
        try {
          await progressApi.addTestResults(added[0]!.challengeId, added);
          return true;
        } catch (err) {
          const ids = new Set(added.map((r) => r.id));
          setData((prev) => (prev ? { ...prev, testResults: prev.testResults.filter((r) => !ids.has(r.id)) } : prev));
          fail('el resultado del test final', err);
          return false;
        }
      },
      addBusinessAnswers: async (challengeId, items) => {
        const at = new Date().toISOString();
        const added: BusinessAnswer[] = items.map((item) => ({
          id: `ba-${crypto.randomUUID().slice(0, 8)}`,
          challengeId,
          questionId: item.questionId,
          at,
          text: item.text,
        }));
        setData((prev) => (prev ? { ...prev, businessAnswers: [...prev.businessAnswers, ...added] } : prev));
        if (!persisted || added.length === 0) return true;
        try {
          await progressApi.addBusinessAnswers(challengeId, added);
          return true;
        } catch (err) {
          const ids = new Set(added.map((a) => a.id));
          setData((prev) => (prev ? { ...prev, businessAnswers: prev.businessAnswers.filter((a) => !ids.has(a.id)) } : prev));
          fail('las respuestas de negocio', err);
          return false;
        }
      },
      dismissNotice: (id) => setNotices((prev) => prev.filter((n) => n.id !== id)),
      reload,
      analyzePending: async () => {
        if (!persisted) return;
        try {
          await progressApi.analyzePending();
          await watchAnalysis();
        } catch (err) {
          fail('el análisis de tus registros', err);
        }
      },
    }),
    [addEvidence, challengeOfStage, persisted, fail, reload, watchAnalysis],
  );

  const insights = useMemo(
    () => (data ? computeInsights(data.concepts, data.challenges, data.evidence, data.testResults) : new Map<string, ConceptInsight>()),
    [data],
  );

  const value = useMemo<AppState>(() => {
    const evidence = data?.evidence ?? [];
    const challengeStatusOf = (c: Challenge) => challengeStatus(c, evidence, started.has(c.id));
    // Challenge actual: entre los que están en curso, el de actividad más reciente (los recién iniciados, sin intentos, van primero).
    const lastActivity = (c: Challenge) =>
      started.has(c.id) && !evidence.some((e) => e.challengeId === c.id)
        ? Infinity
        : Math.max(0, ...evidence.filter((e) => e.challengeId === c.id).map((e) => Date.parse(e.at)));
    const current =
      (data?.challenges ?? [])
        .filter((c) => challengeStatusOf(c) === 'en_curso')
        .sort((a, b) => lastActivity(b) - lastActivity(a))[0] ?? null;
    return {
      loading: !data && !error,
      error,
      source,
      notices,
      analysis,
      attempts,
      data,
      now: data ? new Date(data.now) : new Date(),
      insights,
      apoyoOf: (stageId, initial) => apoyos[stageId] ?? initial,
      challengeStatusOf,
      stageStatusesOf: (c) => stageStatuses(c, evidence, started.has(c.id)),
      currentChallenge: current,
      actions,
    };
  }, [data, error, source, notices, analysis, attempts, insights, apoyos, started, actions]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp debe usarse dentro de <DataProvider>');
  return ctx;
}
