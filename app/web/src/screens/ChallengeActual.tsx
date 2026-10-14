import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { DIFFICULTY_LABEL, DOMAIN_BY_ID } from '../../../shared/domains';
import type { Apoyo, Challenge } from '../../../shared/types';
import { Card, EmptyState, PageHeader, Skeleton } from '../components/cards';
import { DifficultyChip, TimeChip } from '../components/chips';
import { DataBlock } from '../components/DataBlock';
import { DomainTile } from '../components/DomainTile';
import { Markdown } from '../components/Markdown';
import { StageBar } from '../components/StageBar';
import { isTestUnlocked } from '../domain/finalTest';
import { challengeMinutes } from '../domain/progress';
import { isRealChallenge } from '../domain/mergeChallenges';
import { simulateVerification } from '../domain/simulateVerify';
import { useVerifier } from './challenge/useVerifier';
import { useApp } from '../data/DataContext';
import { BusinessQuestions } from './challenge/BusinessQuestions';
import { FinalTest } from './challenge/FinalTest';
import { StageLogPanel } from './challenge/StageLogPanel';
import { initialHelp } from '../domain/stageHelp';
import { initialStageUI, StageCard, type StageUI } from './challenge/StageCard';
import styles from './ChallengeActual.module.css';

export function ChallengeActual() {
  const { id } = useParams();
  const { loading, data, currentChallenge } = useApp();
  if (loading || !data) return <div aria-busy="true"><Skeleton w={320} h={36} /><div style={{ height: 24 }} /><Skeleton h={200} r={16} /></div>;

  const challenge = id ? data.challenges.find((c) => c.id === id) : currentChallenge;
  if (!challenge) {
    return (
      <>
        <PageHeader title="Challenge actual" />
        <EmptyState
          title="No tienes un challenge en curso"
          text="Elige uno de la lista o inicia el recomendado para empezar a practicar."
          action={<Link to="/challenges" className="btn btn-primary">Ver challenges</Link>}
        />
      </>
    );
  }
  return <ChallengeView key={challenge.id} challenge={challenge} />;
}

function ChallengeView({ challenge }: { challenge: Challenge }) {
  const { data, insights, apoyoOf, stageStatusesOf, actions } = useApp();
  const statuses = stageStatusesOf(challenge);
  const firstOpen = challenge.stages.find((s) => statuses.get(s.id) !== 'completada') ?? challenge.stages[0]!;
  const [activeId, setActiveId] = useState(firstOpen.id);
  const [uis, setUis] = useState<Record<string, StageUI>>({ [firstOpen.id]: { ...initialStageUI, open: true } });
  const ui = (stageId: string): StageUI => uis[stageId] ?? initialStageUI;
  const patch = (stageId: string, p: Partial<StageUI>) => setUis((prev) => ({ ...prev, [stageId]: { ...(prev[stageId] ?? initialStageUI), ...p } }));

  // Mantiene la columna lateral coherente si la etapa activa desaparece (p. ej. al cambiar de challenge).
  useEffect(() => setActiveId(firstOpen.id), [challenge.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const conceptMap = useMemo(() => {
    const map = new Map<string, { concept: import('../../../shared/types').Concept; state: import('../../../shared/types').ConceptState }>();
    for (const c of data?.concepts ?? []) map.set(c.id, { concept: c, state: insights.get(c.id)?.state ?? 'no_visto' });
    return map;
  }, [data, insights]);

  const active = challenge.stages.find((s) => s.id === activeId) ?? firstOpen;
  const domains = [...new Set(challenge.stages.map((s) => s.domain))];
  const priorAttempts = (stageId: string) => data?.evidence.filter((e) => e.stageId === stageId).length ?? 0;

  const real = isRealChallenge(challenge.id);
  const verifier = useVerifier((stageId, result) => patch(stageId, { result: { status: result.status, detail: result.summary } }));

  const verify = (stageId: string) => {
    const stage = challenge.stages.find((s) => s.id === stageId)!;
    setActiveId(stageId);
    patch(stageId, { result: null });
    void verifier.run({
      stageId,
      challengeId: challenge.id,
      stageNumber: stage.number,
      apoyo: apoyoOf(stageId, stage.apoyo),
      real,
      simulate: (signal) =>
        simulateVerification({ stage, apoyo: apoyoOf(stageId, stage.apoyo), priorAttempts: priorAttempts(stageId), answer: ui(stageId).answer, signal }),
    });
  };

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.h1}>{challenge.title}</h1>
        <div className={styles.headMeta}>
          <span className={styles.tiles}>{domains.map((d) => <DomainTile key={d} domain={d} variant="color" />)}</span>
          <span className={styles.domainText}>{domains.map((d) => DOMAIN_BY_ID[d].short).join(' · ')}</span>
          <DifficultyChip difficulty={challenge.difficulty} />
          <TimeChip minutes={challengeMinutes(challenge)} />
        </div>
        <StageBar statuses={challenge.stages.map((s) => statuses.get(s.id) ?? 'pendiente')} segment={32} />
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <Card className={styles.statementCard}>
            <section className={styles.block}>
              <h2>Enunciado</h2>
              <Markdown>{challenge.scenario}</Markdown>
              {challenge.task && <Markdown>{challenge.task}</Markdown>}
            </section>
            {challenge.data && challenge.data.tables.length > 0 && (
              <section className={styles.block}>
                <h3>Datos · {challenge.dataset}</h3>
                <DataBlock data={challenge.data} />
              </section>
            )}
          </Card>

          {challenge.stages.map((stage) => {
            const stageUi = ui(stage.id);
            return (
              <StageCard
                key={stage.id}
                stage={stage}
                status={statuses.get(stage.id) ?? 'pendiente'}
                apoyo={apoyoOf(stage.id, stage.apoyo)}
                active={stage.id === active.id}
                ui={stageUi}
                concepts={conceptMap}
                onApoyo={(a: Apoyo) => actions.setApoyo(stage.id, a)}
                onUI={(p) => patch(stage.id, p)}
                onActivate={() => setActiveId(stage.id)}
                real={real}
                verification={verifier.states[stage.id]}
                onVerify={() => verify(stage.id)}
                onCancelVerify={() => verifier.cancel(stage.id)}
              />
            );
          })}

          <BusinessQuestions challengeId={challenge.id} questions={challenge.businessQuestions} />

          <FinalTest
            challenge={challenge}
            unlocked={isTestUnlocked(challenge, statuses)}
            stagesDone={challenge.stages.filter((s) => statuses.get(s.id) === 'completada').length}
            stagesTotal={challenge.stages.length}
          />
        </div>

        <StageLogPanel
          key={active.id}
          stage={active}
          result={ui(active.id).result}
          onRegister={({ actualMinutes, timeSource, blocker, notes }) => {
            const result = ui(active.id).result;
            if (!result) return;
            actions.addEvidence({
              challengeId: challenge.id,
              stageId: active.id,
              at: new Date().toISOString(),
              result: result.status,
              // Abrir la solución marca el intento "Con ayuda" sin importar el resultado (R7).
              withHelp: ui(active.id).solutionOpened,
              apoyo: apoyoOf(active.id, active.apoyo),
              actualMinutes,
              timeSource,
              ...(blocker ? { blocker } : {}),
              ...(notes ? { notes } : {}),
            });
            patch(active.id, { result: null, ...initialHelp });
          }}
        />
      </div>
      <p className={styles.footnote}>
        Dificultad {DIFFICULTY_LABEL[challenge.difficulty]} · la verificación y la evaluación son simuladas hasta conectar los agentes.
      </p>
    </>
  );
}
