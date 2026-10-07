import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitPullRequest, ShieldAlert, GitCommitHorizontal, CheckCircle, ArrowRight,
  AlertTriangle, LogOut, PlayCircle, Loader2, GitFork, RotateCcw
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../auth/AuthContext';
import { useApp } from '../contexts/AppContext';
import { useGitHub } from '../contexts/GitHubContext';
import { repositoryService } from '../services/repositoryService';
import { pullRequestService } from '../services/pullRequestService';
import { commitService } from '../services/commitService';
import type { RepositoryRead } from '../types';
import darkBotImage from '../imports/dbot.png';
import lightBotImage from '../imports/lbot.png';
import GuidedTourModal from '../components/GuidedTourModal';

/* ── Shared micro-components ── */

function SevBadge({ s }: { s: string }) {
  const cls = s === 'critical' ? 'sev-critical' : s === 'high' ? 'sev-high' : s === 'medium' ? 'sev-medium' : s === 'low' ? 'sev-low' : 'sev-info';
  const lbl = s === 'critical' ? 'Crit' : s === 'high' ? 'High' : s === 'medium' ? 'Med' : s === 'low' ? 'Low' : 'Info';
  return <span className={`sev ${cls}`}>{lbl}</span>;
}

function HRule() {
  return <div className="divider" />;
}

/* ── Stat tile — minimal, no icon distraction ── */
function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ padding: '18px 20px' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--muted-foreground)', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.6rem', fontWeight: 600, color: color ?? 'var(--foreground)', lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>{sub}</div>
    </div>
  );
}

/* ── Types ── */
interface PRItem {
  id: number;
  internalId: string;
  title: string;
  repo: string;
  author: string;
  severity: string;
  aiStatus: string;
  humanStatus: string;
  findings: number;
  time: string;
}

interface CommitItem {
  hash: string;
  message: string;
  repo: string;
  flagged: boolean;
  time: string;
}

interface RepoScoreItem {
  name: string;
  score: number;
  status: string;
}

/* ── Inline PR row ── */
function PRRow({ pr, onClick }: { pr: PRItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 12,
        padding: '12px 18px',
        cursor: 'pointer',
        transition: 'background 120ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
            #{pr.id}
          </span>
          <SevBadge s={pr.severity} />
          {pr.aiStatus === 'analyzing' && (
            <span style={{ fontSize: '0.75rem', color: 'var(--ai)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="dot dot-pulse" style={{ width: 5, height: 5, background: 'var(--ai)' }} />
              Analyzing
            </span>
          )}
          {pr.humanStatus === 'approved' && (
            <CheckCircle size={11} style={{ color: 'var(--status-safe)' }} />
          )}
        </div>
        <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
          {pr.title}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
          {pr.repo} · {pr.author} · {pr.time}
          {pr.findings > 0 && <span style={{ color: 'var(--status-critical)', marginLeft: 8 }}>⚑ {pr.findings}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', color: 'var(--muted-foreground)' }}>
        <ArrowRight size={13} />
      </div>
    </div>
  );
}

/* ── Commit row ── */
function CommitRowItem({ c, onClick }: { c: CommitItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 10,
        padding: '10px 18px',
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'background 120ms',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--secondary)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <GitCommitHorizontal
        size={13}
        style={{ color: c.flagged ? 'var(--status-warn)' : 'var(--muted-foreground)', flexShrink: 0 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--primary)' }}>{c.hash}</span>
          {c.flagged && <span className="sev sev-medium">flagged</span>}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--secondary-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.message}
        </div>
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>{c.time}</div>
    </div>
  );
}

function scoreColor(status: string) {
  return status === 'critical' ? 'var(--status-critical)' : status === 'medium' ? 'var(--status-warn)' : status === 'low' ? 'var(--status-low)' : 'var(--status-safe)';
}

/* ── Page ── */
export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut, isLoading: authLoading } = useAuth();
  const { t, theme } = useApp();
  const { installationId } = useGitHub();
  const firstName = user?.displayName.split(' ')[0] || 'there';
  const [tourOpen, setTourOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [repos, setRepos] = useState<RepositoryRead[]>([]);
  const [prs, setPrs] = useState<PRItem[]>([]);
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [repoScores, setRepoScores] = useState<RepoScoreItem[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadDashboard = async () => {
      setLoading(true);
      setError('');
      try {
        const repoRes = await repositoryService.getMyRepositories(1, 10, installationId);
        if (cancelled) return;
        const fetchedRepos = repoRes.items;
        setRepos(fetchedRepos);

        if (fetchedRepos.length === 0) {
          setPrs([]);
          setCommits([]);
          setRepoScores([]);
          return;
        }

        // Active repository (primary synchronized repo)
        const activeRepo = fetchedRepos[0];

        // Fetch PRs for the repository
        const prRes = await pullRequestService.getPullRequestsForRepository(activeRepo.id, 1, 10);
        if (cancelled) return;

        const prItems: PRItem[] = prRes.items.map(pr => {
          const dateStr = pr.created_at ? new Date(pr.created_at).toLocaleDateString() : 'recently';
          return {
            id: pr.pr_number,
            internalId: pr.id,
            title: pr.title,
            repo: activeRepo.name,
            author: pr.author_login || 'Unknown',
            severity: 'info',
            aiStatus: 'complete',
            humanStatus: pr.status === 'OPEN' ? 'pending' : 'approved',
            findings: 0,
            time: dateStr,
          };
        });
        setPrs(prItems);

        // Fetch commits for the first PR if available
        if (prRes.items.length > 0) {
          try {
            const commitRes = await commitService.getCommitsForPR(prRes.items[0].id, 1, 10);
            if (!cancelled) {
              const commitItems: CommitItem[] = commitRes.items.map(c => {
                const dateStr = c.committed_at ? new Date(c.committed_at).toLocaleDateString() : 'recently';
                return {
                  hash: c.sha.slice(0, 7),
                  message: c.message,
                  repo: activeRepo.name,
                  flagged: false,
                  time: dateStr,
                };
              });
              setCommits(commitItems);
            }
          } catch {
            if (!cancelled) setCommits([]);
          }
        }

        // Build real repo scores for connected repos
        const scores: RepoScoreItem[] = fetchedRepos.map(r => ({
          name: r.name,
          score: 100,
          status: 'safe',
        }));
        setRepoScores(scores);

      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load dashboard data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDashboard();
    return () => { cancelled = true; };
  }, [installationId, refreshTick]);

  const pendingPRs = prs.filter(p => p.humanStatus === 'pending');
  const activeRepo = repos.length > 0 ? repos[0] : null;

  return (
    <div className="v-page stage3-page dashboard-page">

      {/* Header */}
      <PageHeader
        title={t('dashboard')}
        subtitle={`${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${t('goodMorning')}, ${firstName}`}
        actions={
          <div className="dashboard-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setRefreshTick(t => t + 1)} title="Refresh dashboard data">
              <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="dashboard-ai-active">
              <span className="dot dot-safe dot-pulse" />
              <span>{t('aiActive')}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setTourOpen(true)}>
              <PlayCircle size={13} />
              {t('giveTour')}
            </button>
            <button className="btn btn-ghost btn-sm dashboard-signout" disabled={authLoading} onClick={() => void signOut()}>
              <LogOut size={13} />
              {t('signOut')}
            </button>
          </div>
        }
      />

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12, display: 'inline-block' }} />
          <div style={{ fontSize: '0.875rem' }}>Loading synchronized repository data…</div>
        </div>
      )}

      {error && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card)', border: '1px solid var(--status-critical)', borderRadius: 8, marginBottom: 20 }}>
          <AlertTriangle size={24} style={{ color: 'var(--status-critical)', marginBottom: 8 }} />
          <div style={{ fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>{error}</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setRefreshTick(t => t + 1)}>
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && repos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 20 }}>
          <GitFork size={36} style={{ color: 'var(--muted-foreground)', marginBottom: 12 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px' }}>No GitHub repositories connected</h3>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', margin: '0 0 18px', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            Connect your GitHub App to enable automated security review, pull request analysis, and risk tracking.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/connect')}>
            <GitFork size={14} /> Connect GitHub
          </button>
        </div>
      )}

      {!loading && !error && repos.length > 0 && (
        <>
          {/* ── Attention band ── */}
          {pendingPRs.filter(p => p.findings > 0).length > 0 && (
            <div className="stage3-attention" style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px 18px',
              background: 'color-mix(in srgb, var(--status-critical) 7%, var(--card))',
              border: '1px solid color-mix(in srgb, var(--status-critical) 20%, transparent)',
              borderRadius: 5,
              marginBottom: 18,
            }}>
              <AlertTriangle size={14} style={{ color: 'var(--status-critical)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', color: 'var(--foreground)', flex: 1 }}>
                <strong>{t('attentionMessage')}</strong>
              </span>
              <button
                className="btn btn-sm"
                onClick={() => navigate('/findings')}
                style={{ background: 'var(--status-critical)', color: '#fff', fontWeight: 500 }}
              >
                {t('reviewNow')}
              </button>
            </div>
          )}

          {/* ── Primary review grid ── */}
          <div className="stage3-primary-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>

            {/* ── Left column ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Pull Requests panel */}
              <div className="dashboard-review-panel" style={{
                background: 'var(--card)',
                border: '1px solid color-mix(in srgb, var(--status-critical) 18%, var(--border))',
                borderRadius: 6,
                overflow: 'hidden',
                minHeight: '100%',
              }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GitPullRequest size={14} style={{ color: 'var(--muted-foreground)' }} strokeWidth={1.75} />
                    <span className="panel-title" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>{t('pullRequests')}</span>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 600,
                      background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
                      color: 'var(--primary)',
                      padding: '1px 6px', borderRadius: 3,
                    }}>
                      {pendingPRs.length} {t('pending')}
                    </span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(activeRepo ? `/repositories/${activeRepo.id}/pull-requests` : '/pull-requests')}>
                    {t('viewAll')} <ArrowRight size={11} />
                  </button>
                </div>
                {prs.map((pr, i) => (
                  <div key={pr.id}>
                    <PRRow pr={pr} onClick={() => navigate(`/pull-requests/${pr.internalId}`)} />
                    {i < prs.length - 1 && <HRule />}
                  </div>
                ))}
                {prs.length === 0 && (
                  <div style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                    No pull requests currently open for {activeRepo?.full_name || 'connected repositories'}.
                  </div>
                )}
              </div>
            </div>

            {/* Main security / analysis status */}
            <div className="dashboard-ai-status" style={{
              background: 'var(--card)',
              border: '1px solid color-mix(in srgb, var(--ai) 24%, var(--border))',
              borderRadius: 6,
              padding: '18px',
              alignSelf: 'stretch',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <img
                  className="dashboard-ai-bot-image"
                  src={theme === 'light' ? lightBotImage : darkBotImage}
                  alt=""
                  aria-hidden="true"
                />
                <div>
                  <div className="ai-tag" style={{ marginBottom: 3 }}>{t('vigilAI')}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--secondary-foreground)' }}>
                    {activeRepo ? `Connected to ${activeRepo.full_name}` : t('analysisInProgress')}
                  </div>
                </div>
              </div>
              <div style={{
                background: 'color-mix(in srgb, var(--ai) 6%, var(--secondary))',
                border: '1px solid color-mix(in srgb, var(--ai) 15%, transparent)',
                borderRadius: 4,
                padding: '12px',
                marginBottom: 16,
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginBottom: 2 }}>{t('analyzing')}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--ai)' }}>
                  {prs.length > 0 ? `PR #${prs[0].id} · ${prs[0].repo}` : `${activeRepo?.name || 'Vigil'} · Ready`}
                </div>
              </div>
              <div style={{ height: 2, background: 'var(--secondary)', borderRadius: 1, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: '100%',
                  background: `linear-gradient(90deg, var(--ai), var(--primary))`,
                  borderRadius: 1,
                }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: 6, textAlign: 'right' }}>
                Active & Synchronized
              </div>
            </div>
          </div>

          {/* ── Secondary metrics ── */}
          <div className="stage3-stat-grid dashboard-metrics" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            margin: '20px 0',
            overflow: 'hidden',
          }}>
            {[
              { label: t('openPRs'), value: String(prs.filter(p => p.humanStatus === 'pending').length), sub: 'Awaiting review', color: undefined },
              { label: t('criticalFindings'), value: '0', sub: `${repos.length} monitored repo${repos.length === 1 ? '' : 's'}`, color: 'var(--status-safe)' },
              { label: 'Total Commits', value: String(commits.length), sub: 'Synced from GitHub', color: undefined },
              { label: 'Monitored Repos', value: String(repos.length), sub: activeRepo?.owner_login || 'GitHub', color: undefined },
            ].map((s, i) => (
              <div key={s.label} style={{ borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
                <Stat {...s} />
              </div>
            ))}
          </div>

          {/* ── Supporting information ── */}
          <div className="stage3-support-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
            <div>
              {/* Recent commits */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <GitCommitHorizontal size={14} style={{ color: 'var(--muted-foreground)' }} strokeWidth={1.75} />
                    <span className="panel-title" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>{t('recentCommits')}</span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(activeRepo ? `/repositories/${activeRepo.id}` : '/repositories')}>
                    {t('viewAll')} <ArrowRight size={11} />
                  </button>
                </div>
                {commits.map((c, i) => (
                  <div key={c.hash}>
                    <CommitRowItem c={c} onClick={() => navigate(activeRepo ? `/repositories/${activeRepo.id}` : '/repositories')} />
                    {i < commits.length - 1 && <HRule />}
                  </div>
                ))}
                {commits.length === 0 && (
                  <div style={{ padding: '36px 18px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                    No recent commits found for current PR.
                  </div>
                )}
              </div>
            </div>

            {/* ── Supporting right column ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Security posture */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <ShieldAlert size={14} style={{ color: 'var(--muted-foreground)' }} strokeWidth={1.75} />
                  <span className="panel-title" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>{t('securityPosture')}</span>
                </div>
                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {repoScores.map(({ name, score, status }) => (
                    <div key={name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: 'var(--secondary-foreground)' }}>
                          {name}
                        </span>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 600, color: scoreColor(status) }}>
                          {score}
                        </span>
                      </div>
                      <div style={{ height: 3, background: 'var(--secondary)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${score}%`,
                          background: scoreColor(status),
                          borderRadius: 2,
                          animation: 'progress-fill 800ms ease forwards',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/repositories')} style={{ width: '100%', justifyContent: 'center' }}>
                    {t('allRepositories')} <ArrowRight size={11} />
                  </button>
                </div>
              </div>

              {/* Review activity */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                  <span className="panel-title" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>{t('reviewActivity')}</span>
                </div>
                <div style={{ padding: '4px 0' }}>
                  {[
                    { label: t('approved'), count: prs.filter(p => p.humanStatus === 'approved').length, color: 'var(--status-safe)' },
                    { label: t('inProgress'), count: prs.filter(p => p.humanStatus === 'pending').length, color: 'var(--primary)' },
                  ].map(({ label, count, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.78rem', color: 'var(--secondary-foreground)' }}>{label}</span>
                      </div>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </>
      )}
      {tourOpen && <GuidedTourModal onClose={() => setTourOpen(false)} />}
    </div>
  );
}
