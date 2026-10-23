import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Apoyo, Challenge } from '../../shared/types';
import type { StatePayload } from '../../shared/state';
import { readAttempt } from '../attempts/attempt-store';
import { scanChallenges, type LoadedChallenge } from '../challenges/challenge-fs';
import { CalibrationError, loadCalibration } from '../generator/calibration';
import { loadLearning } from '../generator/aprendizaje';
import { elegirObjetivo } from '../generator/objetivo';
import { ETAPAS_MAX, ETAPAS_MIN, planChallenge, TemaError } from '../generator/plan';
import { newConceptId, resolveTema } from '../generator/tema';
import { withGraphLock } from '../analyst/analyst-service';
import { scanMaterial } from '../generator/material';
import { ObjetivosError, readObjetivos, writeObjetivos } from './objetivos-store';
import { DOMAINS } from '../../shared/domains';
import type { DomainId } from '../../shared/types';
import { GraphError, readGraph, writeGraph } from './graph-store';
import { readState } from './state';
import {
  ProgressCorruptError,
  answersEntry,
  apoyoEntry,
  evidenceEntry,
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
  /** Se llama al guardar una Evidence nueva (R12: dispara el análisis en segundo plano). */
  onEvidenceSaved?: (evidenceId: string) => void;
  /** Estado en vivo del Analista para `GET /api/state`. */
  analystStatus?: () => { running: boolean; failed: Record<string, string> };
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
    if (err instanceof ObjetivosError) return reply.code(422).send({ error: 'objetivos_invalid', message: err.message, errors: err.errors });
    if (err instanceof GraphError) return reply.code(503).send({ error: 'graph_corrupt', message: err.message, errors: err.errors });
    throw err;
  };
  const notFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: 'challenge_not_found', message: `No encontré el challenge «${id}» (o no cumple el contrato).` });
  const invalid = (reply: FastifyReply, errors: string[]) =>
    reply.code(400).send({ error: 'invalid_record', message: errors[0] ?? 'Registro inválido.', errors });

  const gatherState = () => readState({ repoRoot: opts.repoRoot, strict: opts.strict, now });

  app.get('/api/state', async (_req, reply) => {
    try {
      const state = await gatherState();
      const live = opts.analystStatus?.();
      if (live) state.analysis = { ...state.analysis, running: live.running, failed: live.failed };
      return state;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  /**
   * Plan de calibración del próximo challenge (R38): qué practicar según el grafo y la evidencia. `?dominio=` es la
   * elección manual opcional; por defecto lo recomienda el grafo. Es de solo lectura: no genera nada.
   */
  app.get<{ Querystring: { dominio?: string; concepto?: string; tema?: string; foco?: string; etapas?: string; proyecto?: string } }>('/api/plan', async (req, reply) => {
    const wanted = req.query.dominio;
    if (wanted !== undefined && !DOMAINS.some((d) => d.id === wanted)) {
      return invalid(reply, [`«dominio» debe ser uno de ${DOMAINS.map((d) => d.id).join(', ')}.`]);
    }
    try {
      const [state, config] = await Promise.all([gatherState(), loadCalibration(opts.repoRoot)]);
      const { focos } = await loadLearning(opts.repoRoot, state.data.concepts, config, now(), req.query.foco ? { focoId: req.query.foco } : undefined);
      const etapas = req.query.etapas === undefined ? undefined : Number(req.query.etapas);
      if (etapas !== undefined && (!Number.isInteger(etapas) || etapas < ETAPAS_MIN || etapas > ETAPAS_MAX)) return invalid(reply, [`«etapas» debe ser un entero de ${ETAPAS_MIN} a ${ETAPAS_MAX}.`]);
      let tema = req.query.concepto ? { conceptId: req.query.concepto, texto: (req.query.tema ?? '').slice(0, 120) || req.query.concepto } : undefined;
      if (req.query.foco) {
        const elegido = await elegirObjetivo(opts.repoRoot, req.query.foco, state.data);
        if (!elegido.ok) return invalid(reply, [elegido.message]);
        tema ??= elegido.tema;
      }
      return planChallenge({
        concepts: state.data.concepts,
        challenges: state.data.challenges,
        evidence: state.data.evidence,
        testResults: state.data.testResults,
        config,
        now: now(),
        ...(wanted ? { domain: wanted as DomainId } : {}),
        ...(tema ? { tema } : {}),
        ...(etapas ? { etapas } : {}),
        ...(req.query.proyecto === '1' ? { proyecto: true } : {}),
        focos,
      });
    } catch (err) {
      if (err instanceof TemaError) return invalid(reply, [err.message]);
      if (err instanceof CalibrationError) return reply.code(422).send({ error: 'calibration_invalid', message: err.message });
      return sendError(reply, err);
    }
  });

  /** Resuelve un tema de texto libre contra el grafo (R43): una coincidencia, varias para elegir o ninguna. Solo lectura. */
  app.get<{ Querystring: { q?: string } }>('/api/tema', async (req, reply) => {
    try {
      const graph = await readGraph(opts.repoRoot);
      const r = resolveTema(req.query.q ?? '', graph.concepts);
      return { status: r.status, matches: r.matches.map((c) => ({ id: c.id, name: c.name, domain: c.domain })) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  /**
   * Crea un concepto a petición del usuario (R43): cuando su tema no existe en el grafo. Origen `usuario`; los
   * prerrequisitos deben existir y no puede formar ciclos. Comparte la cola del grafo con el Analista.
   */
  app.post<{ Body: { name?: unknown; domain?: unknown; prerequisites?: unknown } | undefined }>('/api/concepts', async (req, reply) => {
    const b = req.body ?? {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const errors: string[] = [];
    if (name === '' || name.length > 80) errors.push('«name» debe tener entre 1 y 80 caracteres.');
    if (typeof b.domain !== 'string' || !DOMAINS.some((d) => d.id === b.domain)) errors.push(`«domain» debe ser uno de ${DOMAINS.map((d) => d.id).join(', ')}.`);
    const prereqs = Array.isArray(b.prerequisites) && b.prerequisites.every((p) => typeof p === 'string') ? ([...new Set(b.prerequisites)] as string[]) : b.prerequisites === undefined ? [] : null;
    if (prereqs === null || prereqs.length > 5) errors.push('«prerequisites» debe ser una lista de hasta 5 ids.');
    if (errors.length > 0) return invalid(reply, errors);
    try {
      const created = await withGraphLock(opts.repoRoot, async () => {
        const graph = await readGraph(opts.repoRoot);
        const ids = new Set(graph.concepts.map((c) => c.id));
        const missing = prereqs!.filter((p) => !ids.has(p));
        if (missing.length > 0) return { error: `Los prerrequisitos ${missing.join(', ')} no existen en el grafo.` };
        if (graph.concepts.some((c) => c.domain === b.domain && c.name.toLowerCase() === name.toLowerCase())) return { error: `Ya existe un concepto «${name}» en ese dominio.` };
        const concept = { id: newConceptId(b.domain as string, name, ids), name, domain: b.domain as DomainId, prerequisites: prereqs!, origin: 'usuario' as const, since: now().toISOString() };
        await writeGraph(opts.repoRoot, { ...graph, concepts: [...graph.concepts, concept] }, { backup: true });
        return { concept };
      });
      if ('error' in created) return invalid(reply, [created.error!]);
      return reply.code(201).send(created.concept);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  /** Objetivos de aprendizaje (R44). `PUT` reemplaza el archivo completo tras validarlo; si no es válido no se toca. */
  app.get('/api/objetivos', async (_req, reply) => {
    try {
      const [graph, config] = await Promise.all([readGraph(opts.repoRoot), loadCalibration(opts.repoRoot)]);
      const objetivos = await readObjetivos(opts.repoRoot, { conceptIds: new Set(graph.concepts.map((c) => c.id)), focosActivosMax: config.focosActivosMax });
      return { objetivos, limites: { focosActivosMax: config.focosActivosMax, materialMaxCaracteres: config.materialMaxCaracteres } };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  /** Qué hay en la carpeta de material de un foco (R49): archivos con tipo y tamaño, omitidos con motivo y avisos. Solo lectura. */
  app.get<{ Querystring: { carpeta?: string } }>('/api/material', async (req) => scanMaterial(opts.repoRoot, req.query.carpeta ?? ''));

  app.put<{ Body: unknown }>('/api/objetivos', async (req, reply) => {
    try {
      const [graph, config] = await Promise.all([readGraph(opts.repoRoot), loadCalibration(opts.repoRoot)]);
      const objetivos = await writeObjetivos(opts.repoRoot, req.body, { conceptIds: new Set(graph.concepts.map((c) => c.id)), focosActivosMax: config.focosActivosMax });
      return { objetivos };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  /** Un intento completo (R51): snapshot del entregable y feedback. Solo lectura. */
  app.get<{ Params: { id: string; n: string } }>('/api/challenges/:id/attempts/:n', async (req, reply) => {
    const found = await load(req.params.id);
    if (!found) return notFound(reply, req.params.id);
    const attempt = /^\d{1,6}$/.test(req.params.n) ? await readAttempt(found.dir, Number(req.params.n)) : null;
    if (!attempt) return reply.code(404).send({ error: 'attempt_not_found', message: `No encontré el intento ${req.params.n} de «${req.params.id}».` });
    return attempt;
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
      if (!duplicate) opts.onEvidenceSaved?.(evidence.id);
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
