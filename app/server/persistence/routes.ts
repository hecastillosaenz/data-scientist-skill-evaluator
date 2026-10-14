import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Apoyo, Challenge } from '../../shared/types';
import type { StatePayload } from '../../shared/state';
import { scanChallenges, type LoadedChallenge } from '../challenges/challenge-fs';
import { CalibrationError, loadCalibration } from '../generator/calibration';
import { planChallenge } from '../generator/plan';
import { DOMAINS } from '../../shared/domains';
import type { DomainId } from '../../shared/types';
import { configDir } from '../paths';
import { GraphError, readGraph } from './graph-store';
import {
  ProgressCorruptError,
  answersEntry,
  apoyoEntry,
  evidenceEntry,
  readProgress,
  startEntry,
  testEntry,
  updateProgress,
} from './progress-store';
import { checkBusinessAnswers, checkEvidence, checkTestResults, isApoyo } from './records';

export interface StateRoutesOptions {
  repoRoot: string;
  /** Modo estricto del contrato de challenges (R29). */
  strict: boolean;
  /** Reloj inyectable para las fechas que pone el servidor (inicio, cambios de Apoyo). */
  now?: () => Date;
}

async function readUserName(repoRoot: string): Promise<string> {
  try {
    const json = JSON.parse(await readFile(path.join(configDir(repoRoot), 'usuario.json'), 'utf8')) as { name?: unknown };
    if (typeof json.name === 'string' && json.name.trim() !== '') return json.name.trim();
  } catch {
    /* sin archivo: se usa el nombre por defecto */
  }
  return 'Usuario';
}

/**
 * Lectura y escritura del progreso (R33–R36). Cada escritura es atómica y serializada por challenge; los registros se
 * validan contra el `challenge.json` real (la etapa y las preguntas deben existir).
 */
export function registerStateRoutes(app: FastifyInstance, opts: StateRoutesOptions): void {
  const now = opts.now ?? (() => new Date());
  const load = async (id: string): Promise<LoadedChallenge | null> => {
    const scan = await scanChallenges(opts.repoRoot, { strict: opts.strict });
    return scan.loaded.find((c) => c.challenge.id === id) ?? null;
  };

  const sendError = (reply: FastifyReply, err: unknown) => {
    if (err instanceof ProgressCorruptError) return reply.code(422).send({ error: 'progress_corrupt', message: err.message });
    if (err instanceof GraphError) return reply.code(503).send({ error: 'graph_corrupt', message: err.message, errors: err.errors });
    throw err;
  };
  const notFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: 'challenge_not_found', message: `No encontré el challenge «${id}» (o no cumple el contrato).` });
  const invalid = (reply: FastifyReply, errors: string[]) =>
    reply.code(400).send({ error: 'invalid_record', message: errors[0] ?? 'Registro inválido.', errors });

  /** Lee catálogo, challenges y todo el progreso; un progreso ilegible se reporta en `problems` sin romper el resto. */
  const gatherState = async (): Promise<StatePayload> => {
    const [graph, scan, name] = await Promise.all([
      readGraph(opts.repoRoot),
      scanChallenges(opts.repoRoot, { strict: opts.strict }),
      readUserName(opts.repoRoot),
    ]);
    const payload: StatePayload = {
      data: { user: { name }, now: now().toISOString(), concepts: graph.concepts, challenges: [], evidence: [], businessAnswers: [], testResults: [] },
      apoyos: {},
      started: {},
      invalid: scan.invalid,
      problems: [],
    };
    for (const { dir, challenge } of scan.loaded) {
      payload.data.challenges.push(challenge);
      try {
        const p = await readProgress(dir);
        payload.data.evidence.push(...p.evidence);
        payload.data.businessAnswers.push(...p.businessAnswers);
        payload.data.testResults.push(...p.testResults);
        Object.assign(payload.apoyos, p.apoyos);
        if (p.startedAt) payload.started[challenge.id] = p.startedAt;
      } catch (err) {
        if (!(err instanceof ProgressCorruptError)) throw err;
        payload.problems.push(err.message);
      }
    }
    return payload;
  };

  app.get('/api/state', async (_req, reply) => {
    try {
      return await gatherState();
    } catch (err) {
      return sendError(reply, err);
    }
  });

  /**
   * Plan de calibración del próximo challenge (R38): qué practicar según el grafo y la evidencia. `?dominio=` es la
   * elección manual opcional; por defecto lo recomienda el grafo. Es de solo lectura: no genera nada.
   */
  app.get<{ Querystring: { dominio?: string } }>('/api/plan', async (req, reply) => {
    const wanted = req.query.dominio;
    if (wanted !== undefined && !DOMAINS.some((d) => d.id === wanted)) {
      return invalid(reply, [`«dominio» debe ser uno de ${DOMAINS.map((d) => d.id).join(', ')}.`]);
    }
    try {
      const [state, config] = await Promise.all([gatherState(), loadCalibration(opts.repoRoot)]);
      return planChallenge({
        concepts: state.data.concepts,
        challenges: state.data.challenges,
        evidence: state.data.evidence,
        testResults: state.data.testResults,
        config,
        now: now(),
        ...(wanted ? { domain: wanted as DomainId } : {}),
      });
    } catch (err) {
      if (err instanceof CalibrationError) return reply.code(422).send({ error: 'calibration_invalid', message: err.message });
      return sendError(reply, err);
    }
  });

  type P = { Params: { id: string } };

  app.post<P>('/api/challenges/:id/start', async (req, reply) => {
    const found = await load(req.params.id);
    if (!found) return notFound(reply, req.params.id);
    try {
      const startedAt = await updateProgress(found.dir, (p) => {
        if (p.startedAt) return { entries: [], result: p.startedAt };
        p.startedAt = now().toISOString();
        return { entries: [startEntry(p.startedAt)], result: p.startedAt };
      });
      return { startedAt };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put<P & { Params: { stageId: string }; Body: { apoyo?: unknown } }>('/api/challenges/:id/stages/:stageId/apoyo', async (req, reply) => {
    const found = await load(req.params.id);
    if (!found) return notFound(reply, req.params.id);
    const stage = found.challenge.stages.find((s) => s.id === req.params.stageId);
    if (!stage) return invalid(reply, [`La etapa «${req.params.stageId}» no pertenece a ${req.params.id}.`]);
    const apoyo = req.body?.apoyo;
    if (!isApoyo(apoyo)) return invalid(reply, ['`apoyo` debe ser guiado, pistas o autonomo.']);
    try {
      await updateProgress(found.dir, (p) => {
        const current: Apoyo = p.apoyos[stage.id] ?? stage.apoyo;
        if (current === apoyo) return { entries: [], result: null };
        p.apoyos[stage.id] = apoyo;
        return { entries: [apoyoEntry(now().toISOString(), stage.number, current, apoyo)], result: null };
      });
      return { apoyo };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post<P & { Body: unknown }>('/api/challenges/:id/evidence', async (req, reply) => {
    const found = await load(req.params.id);
    if (!found) return notFound(reply, req.params.id);
    const stages = new Map(found.challenge.stages.map((s) => [s.id, s]));
    const checked = checkEvidence(req.body, req.params.id, new Set(stages.keys()));
    if (!checked.ok) return invalid(reply, checked.errors);
    const evidence = checked.value;
    try {
      const duplicate = await updateProgress(found.dir, (p) => {
        if (p.evidence.some((e) => e.id === evidence.id)) return { entries: [], result: true };
        p.evidence.push(evidence);
        const stage = stages.get(evidence.stageId)!;
        return { entries: [evidenceEntry(evidence, stage.number, stage.title)], result: false };
      });
      return { evidence, duplicate };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post<P & { Body: { answers?: unknown } | undefined }>('/api/challenges/:id/business-answers', async (req, reply) => {
    const found = await load(req.params.id);
    if (!found) return notFound(reply, req.params.id);
    const questionIds = new Set(found.challenge.businessQuestions.map((q) => q.id));
    const checked = checkBusinessAnswers(req.body?.answers, req.params.id, questionIds);
    if (!checked.ok) return invalid(reply, checked.errors);
    try {
      const saved = await updateProgress(found.dir, (p) => {
        const fresh = checked.value.filter((a) => !p.businessAnswers.some((b) => b.id === a.id));
        if (fresh.length === 0) return { entries: [], result: 0 };
        p.businessAnswers.push(...fresh);
        return { entries: [answersEntry(fresh, found.challenge as Challenge)], result: fresh.length };
      });
      return { saved };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post<P & { Body: { results?: unknown } | undefined }>('/api/challenges/:id/test-results', async (req, reply) => {
    const found = await load(req.params.id);
    if (!found) return notFound(reply, req.params.id);
    const questions = new Map((found.challenge.finalTest ?? []).map((q) => [q.id, q]));
    const checked = checkTestResults(req.body?.results, req.params.id, questions);
    if (!checked.ok) return invalid(reply, checked.errors);
    try {
      const saved = await updateProgress(found.dir, (p) => {
        const fresh = checked.value.filter((r) => !p.testResults.some((t) => t.id === r.id));
        if (fresh.length === 0) return { entries: [], result: 0 };
        p.testResults.push(...fresh);
        return { entries: [testEntry(fresh, found.challenge as Challenge)], result: fresh.length };
      });
      return { saved };
    } catch (err) {
      return sendError(reply, err);
    }
  });
}
