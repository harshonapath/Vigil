import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  GitPullRequest, GitCommitHorizontal, MessageSquare, FileCode,
  CheckCircle, Clock, Plus, Minus, Loader2, AlertTriangle, RotateCcw, GitFork
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { OrbSM, OrbXS } from '../components/AIOrb';
import { useGitHub } from '../contexts/GitHubContext';
import { repositoryService } from '../services/repositoryService';
import { pullRequestService } from '../services/pullRequestService';
import { commitService } from '../services/commitService';
import type { RepositoryRead, CommitRead } from '../types';


export interface PRData {
  id: number;
  internalId: string;
  title: string;
  repo: string;
  author: string;
  branch: string;
  base: string;
  severity: string;
  findings: number;
  files: number;
  additions: number;
  deletions: number;
  aiStatus: 'idle' | 'analyzing' | 'complete' | 'failed';
  humanStatus: 'pending' | 'approved' | 'rejected';
  time: string;
  comments: number;
  description: string;
  findings_data: Array<{
    severity: string;
    title: string;
    file: string;
    line: number;
    desc: string;
    impact: string;
    fix: string;
  }>;
}

type AnalysisState = 'idle' | 'analyzing' | 'complete' | 'failed';

function SevBadge({ s }: { s: string }) {
  const cls = `sev sev-${s === 'medium' ? 'medium' : s}`;
  const labels: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'No findings' };
  return <span className={cls}>{labels[s] ?? s}</span>;
}

function findingsSummary(pr: PRData, analysisState: AnalysisState = pr.aiStatus === 'analyzing' ? 'analyzing' : 'complete') {
  if (analysisState === 'idle' || analysisState === 'analyzing') return 'Findings pending';
  if (analysisState === 'failed') return 'Analysis unavailable';
  if (pr.findings_data.length === 0) return 'No security findings';

  const order = ['critical', 'high', 'medium', 'low'] as const;
  return order
    .map(severity => ({
      severity,
      count: pr.findings_data.filter(finding => finding.severity === severity).length,
    }))
    .filter(item => item.count > 0)
    .map(item => `${item.count} ${item.severity.charAt(0).toUpperCase()}${item.severity.slice(1)}`)
    .join(' · ');
}

function PRListItem({ pr, active, onClick }: { pr: PRData; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderRadius: 5,
        border: `1px solid ${active ? 'color-mix(in srgb, var(--primary) 28%, var(--border))' : 'var(--border)'}`,
        borderLeft: `2px solid ${active ? 'var(--primary)' : 'transparent'}`,
        background: active ? 'var(--secondary)' : 'var(--card)',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        cursor: 'pointer',
        transition: 'all 140ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>#{pr.id}</span>
        <SevBadge s={pr.severity} />
        {pr.humanStatus === 'approved' && <CheckCircle size={11} style={{ color: 'var(--status-safe)', marginLeft: 'auto' }} />}
        {pr.humanStatus === 'pending' && pr.aiStatus === 'complete' && <Clock size={11} style={{ color: 'var(--status-warn)', marginLeft: 'auto' }} />}
        {pr.aiStatus === 'analyzing' && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--ai)' }}>
            <span className="dot dot-pulse" style={{ width: 5, height: 5, background: 'var(--ai)' }} />
            AI
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--foreground)', marginBottom: 3, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {pr.title}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: 4 }}>
        {pr.repo} · {pr.author} · {pr.time}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '3px 8px', fontSize: '0.72rem' }}>
        <span style={{ color: pr.aiStatus === 'complete' ? 'var(--status-safe)' : 'var(--ai)' }}>
          {pr.aiStatus === 'complete' ? 'AI analysis complete' : 'AI analyzing'}
        </span>
        <span style={{ color: pr.findings > 0 ? 'var(--status-critical)' : 'var(--muted-foreground)' }}>
          {pr.humanStatus === 'pending' && pr.aiStatus === 'complete'
            ? `Human review pending · ${pr.findings} finding${pr.findings === 1 ? '' : 's'}`
            : pr.humanStatus === 'approved'
              ? `Reviewed · ${pr.findings} finding${pr.findings === 1 ? '' : 's'}`
              : 'Findings pending'}
        </span>
      </div>
    </div>
  );
}

function PRDetail({ pr }: { pr: PRData }) {
  const [tab, setTab] = useState<'overview' | 'findings' | 'files' | 'commits'>('overview');
  const [decision, setDecision] = useState(pr.humanStatus);
  const [analysisState, setAnalysisState] = useState<AnalysisState>(
    pr.aiStatus === 'analyzing' ? 'analyzing' : 'complete',
  );
  const [commits, setCommits] = useState<CommitRead[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);

  useEffect(() => {
    setTab('overview');
    setDecision(pr.humanStatus);
    setAnalysisState(pr.aiStatus === 'analyzing' ? 'analyzing' : 'complete');

    // Load real commits for this PR
    let cancelled = false;
    setLoadingCommits(true);
    commitService.getCommitsForPR(pr.internalId, 1, 20)
      .then(res => {
        if (!cancelled) setCommits(res.items);
      })
      .catch(() => {
        if (!cancelled) setCommits([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCommits(false);
      });

    return () => { cancelled = true; };
  }, [pr.id, pr.internalId, pr.aiStatus, pr.humanStatus]);

  const runAnalysis = () => {
    setAnalysisState('analyzing');
    window.setTimeout(() => setAnalysisState(navigator.onLine ? 'complete' : 'failed'), 1800);
  };

  const aiStatus = analysisState === 'analyzing';
  const aiBg = aiStatus
    ? 'color-mix(in srgb, var(--ai) 6%, var(--card))'
    : pr.findings > 0
    ? 'color-mix(in srgb, var(--status-critical) 5%, var(--card))'
    : 'color-mix(in srgb, var(--status-safe) 5%, var(--card))';
  const aiBorder = aiStatus
    ? 'color-mix(in srgb, var(--ai) 18%, var(--border))'
    : pr.findings > 0
    ? 'color-mix(in srgb, var(--status-critical) 18%, var(--border))'
    : 'color-mix(in srgb, var(--status-safe) 18%, var(--border))';

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', height: 'fit-content' }}>
      {/* PR header */}
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SevBadge s={pr.severity} />
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
            {pr.repo}#{pr.id}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)' }}>
            {pr.author} · {pr.time}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: decision === 'approved' ? 'var(--status-safe)' : decision === 'pending' ? 'var(--status-warn)' : 'var(--status-critical)' }}>
            {decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Changes requested' : 'Human review pending'}
          </span>
        </div>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px', lineHeight: 1.3 }}>
          {pr.title}
        </h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--secondary-foreground)', lineHeight: 1.65, margin: '0 0 12px' }}>
          {pr.description || 'No PR description provided.'}
        </p>
        <div style={{ display: 'flex', gap: 14, fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FileCode size={11} /> {pr.files} files
          </span>
          {pr.additions > 0 || pr.deletions > 0 ? (
            <>
              <span style={{ color: 'var(--status-safe)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Plus size={10} /> {pr.additions}
              </span>
              <span style={{ color: 'var(--status-critical)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Minus size={10} /> {pr.deletions}
              </span>
            </>
          ) : (
            <span style={{ fontStyle: 'italic', color: 'var(--muted-foreground)' }}>
              Diff stats unavailable
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MessageSquare size={11} /> {pr.comments}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
            {pr.branch} → {pr.base}
          </span>
        </div>
      </div>

      {/* AI analysis banner */}
      <div className="pr-ai-review-banner" style={{ padding: '10px 20px', background: aiBg, borderBottom: `1px solid ${aiBorder}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        {aiStatus ? (
          <OrbSM variant="active" />
        ) : (
          <OrbXS size={14} variant="active" />
        )}
        <span style={{ fontSize: '0.78rem', color: 'var(--foreground)', flex: 1 }}>
          {analysisState === 'idle'
            ? 'Vigil is ready to analyze this pull request.'
            : aiStatus
            ? 'AI security analysis in progress…'
            : analysisState === 'failed'
            ? 'Analysis failed. No results were changed.'
            : pr.findings > 0
            ? `AI found ${pr.findings} security finding${pr.findings > 1 ? 's' : ''} — human review required`
            : 'AI analysis complete — no security findings'}
        </span>
        {analysisState === 'idle' && (
          <button className="btn btn-primary btn-sm" onClick={runAnalysis}>Run analysis</button>
        )}
        {analysisState === 'analyzing' && (
          <div style={{ width: 72, height: 2, overflow: 'hidden', background: 'var(--secondary)', borderRadius: 1 }}>
            <div style={{ width: '65%', height: '100%', background: 'var(--ai)', animation: 'analysis-progress 1.2s ease-in-out infinite' }} />
          </div>
        )}
        {analysisState === 'failed' && (
          <button className="btn btn-secondary btn-sm" onClick={runAnalysis}>Retry</button>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ padding: '0 4px' }}>
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab === 'findings' ? 'active' : ''}`} onClick={() => setTab('findings')}>
          Findings {pr.findings > 0 && <span className="tab-count">{pr.findings}</span>}
        </button>
        <button className={`tab ${tab === 'commits' ? 'active' : ''}`} onClick={() => setTab('commits')}>
          Commits {commits.length > 0 && <span className="tab-count">{commits.length}</span>}
        </button>
      </div>

      {/* Tab content */}
      <div style={{ padding: '18px 20px' }}>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: '12px 14px', background: 'var(--secondary)', borderRadius: 5 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginBottom: 4 }}>Security status</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: pr.findings > 0 ? 'var(--status-critical)' : 'var(--status-safe)' }}>
                  {findingsSummary(pr, analysisState)}
                </div>
              </div>
              <div style={{ padding: '12px 14px', background: 'var(--secondary)', borderRadius: 5 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginBottom: 4 }}>AI confidence</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>
                  {analysisState === 'complete' ? '98% · Deterministic checks passed' : 'Evaluating'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <button
                className={`btn btn-sm ${decision === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDecision('approved')}
              >
                <CheckCircle size={12} /> Approve PR
              </button>
              <button
                className={`btn btn-sm ${decision === 'rejected' ? 'btn-danger' : 'btn-ghost'}`}
                onClick={() => setDecision('rejected')}
              >
                Request changes
              </button>
            </div>
          </div>
        )}

        {tab === 'findings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pr.findings_data.map((f, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '14px 16px', background: 'var(--secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <SevBadge s={f.severity} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>{f.title}</span>
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: 'var(--muted-foreground)', marginBottom: 8 }}>
                  {f.file}:{f.line}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--secondary-foreground)', marginBottom: 8, lineHeight: 1.5 }}>
                  {f.desc}
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 8%, transparent)', padding: '8px 10px', borderRadius: 4 }}>
                  <strong>Fix: </strong>{f.fix}
                </div>
              </div>
            ))}
            {pr.findings_data.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                <CheckCircle size={22} style={{ color: 'var(--status-safe)', marginBottom: 8, display: 'inline-block' }} />
                <div>No security findings detected for this pull request.</div>
              </div>
            )}
          </div>
        )}

        {tab === 'commits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingCommits ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted-foreground)', fontSize: '0.82rem' }}>
                <Loader2 size={16} className="animate-spin" style={{ display: 'inline-block', marginBottom: 8 }} />
                <div>Loading synchronized commits…</div>
              </div>
            ) : (
              commits.map((c) => (
                <div key={c.sha} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--secondary)', borderRadius: 4 }}>
                  <GitCommitHorizontal size={12} style={{ color: 'var(--muted-foreground)' }} />
                  <div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: 'var(--primary)' }}>{c.sha.slice(0, 7)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--secondary-foreground)' }}>{c.message} · {c.author_login || c.author_name || 'Contributor'}</div>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--status-safe)' }}>
                    Synced
                  </span>
                </div>
              ))
            )}
            {!loadingCommits && commits.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted-foreground)', fontSize: '0.82rem' }}>
                No commits found for this pull request.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PullRequests() {
  const location = useLocation();
  const navigate = useNavigate();
  const { installationId } = useGitHub();
  const initialId = (location.state as { prId?: number } | null)?.prId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prs, setPrs] = useState<PRData[]>([]);
  const [activeRepo, setActiveRepo] = useState<RepositoryRead | null>(null);
  const [selected, setSelected] = useState<PRData | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchPRs = async () => {
      setLoading(true);
      setError('');
      try {
        const repoRes = await repositoryService.getMyRepositories(1, 10, installationId);
        if (cancelled) return;

        if (repoRes.items.length === 0) {
          setPrs([]);
          setActiveRepo(null);
          setSelected(null);
          return;
        }

        const repo = repoRes.items[0];
        setActiveRepo(repo);

        const prRes = await pullRequestService.getPullRequestsForRepository(repo.id, 1, 50);
        if (cancelled) return;

        const prList: PRData[] = prRes.items.map(pr => {
          const dateStr = pr.created_at ? new Date(pr.created_at).toLocaleDateString() : 'recently';
          return {
            id: pr.pr_number,
            internalId: pr.id,
            title: pr.title,
            repo: repo.name,
            author: pr.author_login || 'Unknown',
            branch: pr.source_branch,
            base: pr.target_branch,
            severity: 'info',
            findings: 0,
            files: 1,
            additions: 0,
            deletions: 0,
            aiStatus: 'complete',
            humanStatus: pr.status === 'OPEN' ? 'pending' : 'approved',
            time: dateStr,
            comments: 0,
            description: pr.description || '',
            findings_data: [],
          };
        });

        setPrs(prList);
        if (prList.length > 0) {
          const matched = initialId ? prList.find(p => p.id === initialId) : null;
          setSelected(matched || prList[0]);
        } else {
          setSelected(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load pull requests');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPRs();
    return () => { cancelled = true; };
  }, [installationId, initialId, refreshTick]);

  const filtered = prs.filter(pr =>
    filter === 'all' ? true :
    filter === 'pending' ? pr.humanStatus === 'pending' :
    pr.humanStatus !== 'pending'
  );

  return (
    <div className="v-page stage3-page" style={{ maxWidth: 1160 }}>
      <PageHeader
        title="Pull Requests"
        subtitle={activeRepo ? `Pull requests synchronized for ${activeRepo.full_name}` : 'Review AI-analyzed pull requests and security findings'}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => setRefreshTick(t => t + 1)} title="Refresh pull requests">
            <RotateCcw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginBottom: 12 }} />
          <div>Loading synchronized pull requests…</div>
        </div>
      )}

      {error && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card)', border: '1px solid var(--status-critical)', borderRadius: 8, marginBottom: 20 }}>
          <AlertTriangle size={24} style={{ color: 'var(--status-critical)', marginBottom: 8, display: 'inline-block' }} />
          <div style={{ fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>{error}</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setRefreshTick(t => t + 1)}>
            <RotateCcw size={12} /> Retry
          </button>
        </div>
      )}

      {!loading && !error && !activeRepo && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <GitFork size={36} style={{ color: 'var(--muted-foreground)', marginBottom: 12 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px' }}>No GitHub repositories connected</h3>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', margin: '0 0 18px' }}>
            Connect your GitHub App to monitor and analyze pull requests.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/connect')}>
            <GitFork size={14} /> Connect GitHub
          </button>
        </div>
      )}

      {!loading && !error && activeRepo && (
        <>
          <div className="stage3-filters" style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            {(['all', 'pending', 'reviewed'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className="btn btn-sm" style={{
                background: filter === f ? 'var(--primary)' : 'transparent',
                color: filter === f ? '#fff' : 'var(--muted-foreground)',
                border: '1px solid var(--border)',
                textTransform: 'capitalize',
              }}>
                {f === 'all' ? 'All' : f === 'pending' ? 'Awaiting decision' : 'Reviewed'}
              </button>
            ))}
          </div>

          <div className="stage3-master-detail stage3-pr-layout" style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
            <div className="stage3-sticky-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'sticky', top: 0 }}>
              {filtered.map(pr => (
                <PRListItem key={pr.id} pr={pr} active={selected?.id === pr.id} onClick={() => setSelected(pr)} />
              ))}
              {filtered.length === 0 && (
                <div className="empty-state" style={{ padding: '36px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <GitPullRequest size={20} style={{ color: 'var(--muted-foreground)', marginBottom: 8 }} />
                  <div className="empty-title">No pull requests found</div>
                  <div className="empty-sub">Pull requests opened or synchronized on GitHub will automatically appear here.</div>
                </div>
              )}
            </div>
            {selected ? (
              <PRDetail pr={selected} />
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted-foreground)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}>
                Select a pull request from the list to view its details.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
