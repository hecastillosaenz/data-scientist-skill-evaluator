import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronDown, Sparkles } from 'lucide-react';
import { BLOOM_LABEL, DIFFICULTY_LABEL, DOMAINS, DOMAIN_BY_ID } from '../../../shared/domains';
import type { Bloom, Challenge, ChallengeStatus, Difficulty, DomainId, Stage } from '../../../shared/types';
import { Card, EmptyState, PageHeader, Skeleton, StickyPanel } from '../components/cards';
import { BloomChip, DifficultyChip, StatusChip, TimeChip } from '../components/chips';
import { DomainTile } from '../components/DomainTile';
import { FilterChip } from '../components/FilterChip';
import { StageBar } from '../components/StageBar';
import { challengeMinutes } from '../domain/progress';
import { emptyFilters, filterChallenges, sortChallenges, type ChallengeFilters } from '../domain/challengeFilters';
import { latestResults, scoreOf } from '../domain/finalTest';
import { useApp } from '../data/DataContext';
import { useGeneratorDialog } from './generate/GenerateDialog';
import styles from './Challenges.module.css';

const STATUS_LABEL: Record<ChallengeStatus, string> = { en_curso: 'En curso', pendiente: 'Pendiente', completada: 'Completada' };
const MECHANISM_LABEL = { codigo_assert: 'Código', rubric_claude: 'Conceptual' } as const;
const DIFFICULTIES: Difficulty[] = [1, 2, 3];
const BLOOMS: Bloom[] = [1, 2, 3, 4, 5, 6];
const STATUSES: ChallengeStatus[] = ['en_curso', 'pendiente', 'completada'];

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function Challenges() {
  const { loading, data, challengeStatusOf, stageStatusesOf, currentChallenge, source } = useApp();
  const generator = useGeneratorDialog();
  const [filters, setFilters] = useState<ChallengeFilters>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = useMemo(() => (data ? sortChallenges(data.challenges, challengeStatusOf) : []), [data, challengeStatusOf]);
  const visible = useMemo(() => filterChallenges(all, filters, challengeStatusOf), [all, filters, challengeStatusOf]);

  if (loading || !data) return <ChallengesSkeleton />;

  const selected = visible.find((c) => c.id === selectedId) ?? visible.find((c) => c.id === currentChallenge?.id) ?? visible[0] ?? null;
  const hasFilters = Object.values(filters).some((s: Set<unknown>) => s.size > 0);

  // Conteos sobre el total, para que los chips orienten antes de filtrar.
  const countDomain = (d: DomainId) => all.filter((c) => c.stages.some((s) => s.domain === d)).length;
  const countBloom = (b: Bloom) => all.filter((c) => c.stages.some((s) => s.bloom === b)).length;
  const countDifficulty = (d: Difficulty) => all.filter((c) => c.difficulty === d).length;
  const countStatus = (s: ChallengeStatus) => all.filter((c) => challengeStatusOf(c) === s).length;

  return (
    <>
      <PageHeader
        title="Challenges"
        subtitle={`${all.length} challenges · ${countStatus('completada')} completados`}
        actions={
          source === 'real' ? (
            <button type="button" className="btn btn-primary" onClick={generator.open}><Sparkles size={16} aria-hidden="true" /> Generar nuevo challenge</button>
          ) : undefined
        }
      />

      <Card className={styles.filters}>
        <FilterGroup label="Dominio">
          {DOMAINS.map((d) => (
            <FilterChip key={d.id} count={countDomain(d.id)} active={filters.domains.has(d.id)} onClick={() => setFilters((f) => ({ ...f, domains: toggle(f.domains, d.id) }))}>
              {d.short}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Dificultad">
          {DIFFICULTIES.map((d) => (
            <FilterChip key={d} count={countDifficulty(d)} active={filters.difficulties.has(d)} onClick={() => setFilters((f) => ({ ...f, difficulties: toggle(f.difficulties, d) }))}>
              {DIFFICULTY_LABEL[d]}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Nivel cognitivo">
          {BLOOMS.map((b) => (
            <FilterChip key={b} count={countBloom(b)} active={filters.blooms.has(b)} onClick={() => setFilters((f) => ({ ...f, blooms: toggle(f.blooms, b) }))}>
              B{b} {BLOOM_LABEL[b]}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label="Estado">
          {STATUSES.map((s) => (
            <FilterChip key={s} count={countStatus(s)} active={filters.statuses.has(s)} onClick={() => setFilters((f) => ({ ...f, statuses: toggle(f.statuses, s) }))}>
              {STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </FilterGroup>
        {hasFilters && (
          <button type="button" className={`btn btn-sm ${styles.clear}`} onClick={() => setFilters(emptyFilters())}>
            Limpiar filtros
          </button>
        )}
      </Card>

      <div className={styles.layout}>
        <Card className={styles.tableCard}>
          {visible.length === 0 ? (
            <EmptyState title="Ningún challenge coincide" text="Prueba con menos filtros." action={<button type="button" className="btn btn-sm" onClick={() => setFilters(emptyFilters())}>Limpiar filtros</button>} />
          ) : (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Challenge</th>
                    <th scope="col">Dominios</th>
                    <th scope="col">Dificultad</th>
                    <th scope="col">Progreso</th>
                    <th scope="col">Tiempo total</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => {
                    const statuses = stageStatusesOf(c);
                    const domains = [...new Set(c.stages.map((s) => s.domain))];
                    const isSel = c.id === selected?.id;
                    return (
                      <tr key={c.id} className={isSel ? styles.selected : ''} onClick={() => setSelectedId(c.id)}>
                        <th scope="row">
                          <button type="button" className={styles.rowBtn} aria-pressed={isSel} onClick={() => setSelectedId(c.id)}>
                            <span className={styles.rowTitle}>{c.title}</span>
                            <span className={styles.rowSub}>{c.dataset}{c.recommended && challengeStatusOf(c) === 'pendiente' ? ' · Recomendado' : ''}</span>
                          </button>
                        </th>
                        <td><span className={styles.tiles}>{domains.map((d) => <DomainTile key={d} domain={d} size={28} />)}</span></td>
                        <td><DifficultyChip difficulty={c.difficulty} /></td>
                        <td><StageBar statuses={c.stages.map((s) => statuses.get(s.id) ?? 'pendiente')} segment={18} /></td>
                        <td><TimeChip minutes={challengeMinutes(c)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {selected && <ChallengePreview key={selected.id} challenge={selected} />}
      </div>
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className={styles.chips}>{children}</div>
    </div>
  );
}

function ChallengePreview({ challenge }: { challenge: Challenge }) {
  const { data, challengeStatusOf, stageStatusesOf, actions } = useApp();
  const navigate = useNavigate();
  const status = challengeStatusOf(challenge);
  const statuses = stageStatusesOf(challenge);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const cta =
    status === 'en_curso' ? (
      <Link className="btn btn-primary" to={`/challenge-actual/${challenge.id}`}>Continuar challenge</Link>
    ) : status === 'pendiente' ? (
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          actions.startChallenge(challenge.id);
          navigate(`/challenge-actual/${challenge.id}`);
        }}
      >
        Iniciar challenge
      </button>
    ) : (
      <Link className="btn" to={`/challenge-actual/${challenge.id}`}>Revisar challenge</Link>
    );

  return (
    <StickyPanel label="Vista previa del challenge">
      <Card className={styles.preview}>
        <div className={styles.previewHead}>
          <h2>{challenge.title}</h2>
          <p className={styles.rowSub}>{challenge.dataset} · {STATUS_LABEL[status]}</p>
          <div className={styles.previewMeta}>
            <DifficultyChip difficulty={challenge.difficulty} />
            <TimeChip minutes={challengeMinutes(challenge)} />
            {challenge.finalTest && <TestChip challenge={challenge} results={data?.testResults ?? []} />}
          </div>
          <StageBar statuses={challenge.stages.map((s) => statuses.get(s.id) ?? 'pendiente')} segment={28} />
        </div>

        <ol className={styles.stages}>
          {challenge.stages.map((stage) => {
            const isOpen = open.has(stage.id);
            return (
              <li key={stage.id} className={styles.stage}>
                <button
                  type="button"
                  className={styles.stageBtn}
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => toggle(o, stage.id))}
                >
                  <span className={`${styles.stageNum} mono`}>{stage.number}</span>
                  <span className={styles.stageMain}>
                    <span className={styles.stageTitle}>{stage.title}</span>
                    <span className={styles.stageChips}>
                      <DomainTile domain={stage.domain} size={22} />
                      <BloomChip bloom={stage.bloom} />
                      <StatusChip state={statuses.get(stage.id) ?? 'pendiente'} />
                    </span>
                  </span>
                  <ChevronDown size={16} aria-hidden="true" className={isOpen ? styles.chevOpen : ''} />
                </button>
                {isOpen && <StageDetail stage={stage} />}
              </li>
            );
          })}
        </ol>
        <div className={styles.cta}>{cta}</div>
      </Card>
    </StickyPanel>
  );
}

/** Chip «Test 5/7» con el último resultado del test final, o «pendiente» si aún no se hace. */
function TestChip({ challenge, results }: { challenge: Challenge; results: import('../../../shared/types').TestResult[] }) {
  const score = scoreOf(latestResults(results, challenge.id), challenge.finalTest ?? []);
  return (
    <span className={`${styles.testChip} mono`} title="Test final de retención">
      Test {score ? `${score.correct}/${score.total}` : 'pendiente'}
    </span>
  );
}

function StageDetail({ stage }: { stage: Stage }) {
  const { data } = useApp();
  const names = stage.conceptIds.map((id) => data?.concepts.find((c) => c.id === id)?.name ?? id);
  return (
    <div className={styles.detail}>
      <p>{stage.description}</p>
      <dl>
        <div><dt>Dominio</dt><dd>{DOMAIN_BY_ID[stage.domain].name}</dd></div>
        <div><dt>Dificultad</dt><dd>{DIFFICULTY_LABEL[stage.difficulty]}</dd></div>
        <div><dt>Tiempo</dt><dd className="mono">{stage.estimatedMinutes} min</dd></div>
        <div><dt>Tipo</dt><dd>{MECHANISM_LABEL[stage.mechanism]}</dd></div>
      </dl>
      <p className={styles.conceptsLabel}>Conceptos</p>
      <ul className={styles.concepts}>{names.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  );
}

function ChallengesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <Skeleton w={200} h={32} />
      <div style={{ height: 24 }} />
      <Skeleton h={150} r={16} />
      <div className={styles.layout} style={{ marginTop: 20 }}>
        <Skeleton h={420} r={16} />
        <Skeleton h={420} r={16} />
      </div>
    </div>
  );
}
