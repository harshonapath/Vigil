import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GitCommitHorizontal,
  AlertTriangle,
  CheckCircle,
  GitPullRequest,
  ArrowRight,
  Loader2,
  RotateCcw,
  GitFork,
} from 'lucide-react';
import { OrbXS } from '../components/AIOrb';
import PageHeader from '../components/PageHeader';
import { useGitHub } from '../contexts/GitHubContext';
import { repositoryService } from '../services/repositoryService';
import { pullRequestService } from '../services/pullRequestService';
import { commitService } from '../services/commitService';
import type { RepositoryRead, CommitAnalysisRead } from '../types';

export interface CommitDisplay {
  hash: string;
  fullHash: string;
  message: string;
  author: string;
  email: string;
  repo: string;
  branch: string;
  time: string;
  date: string;
  pr: number;
  prInternalId: string;
  prTitle: string;
  file: string;
  diff: string;
}

export default function Commits() {
  const navigate = useNavigate();
  const { installationId } = useGitHub();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commits, setCommits] = useState<CommitDisplay[]>([]);
  const [selected, setSelected] = useState<CommitDisplay | null>(null);
  const [activeRepo, setActiveRepo] = useState<RepositoryRead | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Commit Analysis State
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [commitAnalysis, setCommitAnalysis] = useState<CommitAnalysisRead | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCommits = async () => {
      setLoading(true);
      setError('');
      try {
        const repoRes = await repositoryService.getMyRepositories(1, 10, installationId);
        if (cancelled) return;

        if (repoRes.items.length === 0) {
          setCommits([]);
          setSelected(null);
          setActiveRepo(null);
          return;
        }

        const repo = repoRes.items[0];
        setActiveRepo(repo);

        const prRes = await pullRequestService.getPullRequestsForRepository(repo.id, 1, 10);
        if (cancelled) return;

        const allCommits: CommitDisplay[] = [];

        for (const pr of prRes.items) {
          try {
            const commitRes = await commitService.getCommitsForPR(pr.id, 1, 20);
            for (const c of commitRes.items) {
              const dt = new Date(c.committed_at || c.created_at);
              allCommits.push({
                hash: c.sha.slice(0, 7),
                fullHash: c.sha,
                message: c.message,
                author: c.author_login || c.author_name || 'Contributor',
                email: c.author_email || '',
                repo: repo.name,
                branch: pr.target_branch || 'main',
                time: dt.toLocaleDateString(),
                date: dt.toLocaleString(),
                pr: pr.pr_number,
                prInternalId: pr.id,
                prTitle: pr.title,
                file: 'Synchronized files',
                diff: `Commit: ${c.sha}\nAuthor: ${c.author_name || c.author_login} <${c.author_email}>\nDate:   ${c.committed_at || c.created_at}\n\n    ${c.message}`,
              });
            }
          } catch {
            // continue loading other PR commits
          }
        }

        if (cancelled) return;
        setCommits(allCommits);
        if (allCommits.length > 0) {
          setSelected(allCommits[0]);
        } else {
          setSelected(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load commits');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadCommits();
    return () => {
      cancelled = true;
    };
  }, [installationId, refreshTick]);

  // Load analysis whenever selected commit changes
  useEffect(() => {
    if (!selected) {
      setCommitAnalysis(null);
      return;
    }

    let cancelled = false;
    const fetchAnalysis = async () => {
      setAnalysisLoading(true);
      setAnalysisError('');
      try {
        const res = await commitService.getCommitAnalysisBySha(selected.fullHash);
        if (!cancelled) {
          setCommitAnalysis(res);
        }
      } catch {
        if (!cancelled) {
          setCommitAnalysis(null);
        }
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    };

    void fetchAnalysis();
    return () => {
      cancelled = true;
    };
  }, [selected?.fullHash]);

  const handleRunAnalysis = async () => {
    if (!selected) return;
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const res = await commitService.triggerCommitAnalysis(selected.fullHash);
      setCommitAnalysis(res);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Failed to trigger commit completeness analysis');
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <div className="stage3-page" style={{ padding: '32px 36px', maxWidth: '1200px' }}>
      <PageHeader
        title="Commit Analysis"
        subtitle={
          activeRepo
            ? `Completeness and security review of synchronized commits in ${activeRepo.full_name}`
            : 'Security-focused review of recent commits'
        }
        actions={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRefreshTick(t => t + 1)}
            title="Refresh commits"
          >
            <RotateCcw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginBottom: 12 }} />
          <div>Loading synchronized commits from backend…</div>
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

      {!loading && !error && commits.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <GitFork size={36} style={{ color: 'var(--muted-foreground)', marginBottom: 12 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px' }}>
            No commits found
          </h3>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', margin: '0 0 18px' }}>
            Commits associated with pull requests will automatically appear once synchronized.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/repositories')}>
            View Repositories
          </button>
        </div>
      )}

      {!loading && !error && commits.length > 0 && selected && (
        <div className="stage3-master-detail" style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '20px' }}>
          {/* Commit list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {commits.map(c => (
              <div
                key={c.fullHash}
                onClick={() => setSelected(c)}
                style={{
                  padding: '14px 16px',
                  background: selected.fullHash === c.fullHash ? 'var(--secondary)' : 'var(--card)',
                  border: `1px solid ${selected.fullHash === c.fullHash ? 'color-mix(in srgb, var(--primary) 30%, var(--border))' : 'var(--border)'}`,
                  borderLeft: `2px solid ${selected.fullHash === c.fullHash ? 'var(--primary)' : 'transparent'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <GitCommitHorizontal size={12} style={{ color: 'var(--muted-foreground)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--primary)' }}>
                    {c.hash}
                  </span>
                  <CheckCircle size={11} style={{ color: 'var(--accent)', marginLeft: 'auto' }} />
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: '500', color: 'var(--foreground)', marginBottom: '4px', lineHeight: '1.4' }}>
                  {c.message}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                  {c.repo} · {c.author} · {c.time}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.7rem' }}>
                  <span style={{ color: 'var(--accent)' }}>PR #{c.pr}</span>
                  <span style={{ color: 'var(--muted-foreground)' }}>Synced</span>
                </div>
              </div>
            ))}
          </div>

          {/* Commit detail panel */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--primary)', background: 'color-mix(in srgb, var(--primary) 10%, transparent)', padding: '2px 8px', borderRadius: '4px' }}>
                  {selected.hash}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                  {selected.repo} · {selected.branch}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                  {selected.date}
                </span>
              </div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--foreground)', margin: '0 0 10px', lineHeight: '1.4' }}>
                {selected.message}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--secondary-foreground)' }}>
                <span>{selected.author}</span>
                {selected.email && <span style={{ color: 'var(--muted-foreground)' }}>&lt;{selected.email}&gt;</span>}
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.75rem', color: 'var(--muted-foreground)', alignItems: 'center' }}>
                <span>Associated PR: #{selected.pr}</span>
                <span style={{ color: 'var(--accent)' }}>{selected.prTitle}</span>
                <span style={{ marginLeft: 'auto', fontStyle: 'italic', color: 'var(--muted-foreground)' }}>
                  Diff stats unavailable
                </span>
              </div>
            </div>

            {/* Commit Completeness Analysis Section */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <OrbXS size={12} variant="active" />
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ai)' }}>
                    Completeness & Security Analysis
                  </span>
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleRunAnalysis}
                  disabled={analysisLoading}
                >
                  {analysisLoading ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Analyzing…
                    </>
                  ) : commitAnalysis ? (
                    'Re-analyze Commit'
                  ) : (
                    'Run Completeness Analysis'
                  )}
                </button>
              </div>

              {analysisError && (
                <div style={{ color: 'var(--status-critical)', fontSize: '0.8rem', marginBottom: 10 }}>
                  {analysisError}
                </div>
              )}

              {commitAnalysis ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)' }}>Overall Status:</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background:
                          commitAnalysis.overall_status === 'NO_SIGNIFICANT_GAPS'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : commitAnalysis.overall_status === 'NEEDS_REVIEW'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(148, 163, 184, 0.15)',
                        color:
                          commitAnalysis.overall_status === 'NO_SIGNIFICANT_GAPS'
                            ? '#34d399'
                            : commitAnalysis.overall_status === 'NEEDS_REVIEW'
                            ? '#fbbf24'
                            : '#94a3b8',
                      }}
                    >
                      {commitAnalysis.overall_status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {commitAnalysis.summary && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--foreground)', lineHeight: '1.6' }}>
                      {commitAnalysis.summary}
                    </p>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: 4 }}>
                    {commitAnalysis.implementation_notes && (
                      <div style={{ padding: '10px 12px', background: 'var(--secondary)', borderRadius: '6px', fontSize: '0.78rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>Implementation Notes</div>
                        <div style={{ color: 'var(--foreground)', lineHeight: 1.5 }}>{commitAnalysis.implementation_notes}</div>
                      </div>
                    )}
                    {commitAnalysis.testing_notes && (
                      <div style={{ padding: '10px 12px', background: 'var(--secondary)', borderRadius: '6px', fontSize: '0.78rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>Testing Assessment</div>
                        <div style={{ color: 'var(--foreground)', lineHeight: 1.5 }}>{commitAnalysis.testing_notes}</div>
                      </div>
                    )}
                    {commitAnalysis.error_handling_notes && (
                      <div style={{ padding: '10px 12px', background: 'var(--secondary)', borderRadius: '6px', fontSize: '0.78rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>Error Handling</div>
                        <div style={{ color: 'var(--foreground)', lineHeight: 1.5 }}>{commitAnalysis.error_handling_notes}</div>
                      </div>
                    )}
                    {commitAnalysis.documentation_notes && (
                      <div style={{ padding: '10px 12px', background: 'var(--secondary)', borderRadius: '6px', fontSize: '0.78rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: 4 }}>Documentation</div>
                        <div style={{ color: 'var(--foreground)', lineHeight: 1.5 }}>{commitAnalysis.documentation_notes}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--muted-foreground)', fontSize: '0.82rem', lineHeight: '1.6' }}>
                  No automated completeness analysis has been stored for commit {selected.hash} yet. Click "Run Completeness Analysis" to analyze this commit's implementation, testing coverage, and error handling.
                </div>
              )}
            </div>

            {/* Commit Header & Metadata */}
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', marginBottom: '10px' }}>
                Commit Information
              </div>
              <div
                className="commit-diff"
                style={{
                  background: 'var(--code-background)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'auto',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  lineHeight: '1.6',
                  padding: '16px',
                  color: 'var(--foreground)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {selected.diff}
              </div>
            </div>

            {/* Related workflow actions */}
            <div className="commit-related-actions" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '12px' }}>
              <button className="btn btn-primary" onClick={() => navigate(`/pull-requests/${selected.prInternalId}`)}>
                <GitPullRequest size={13} /> View Pull Request #{selected.pr} <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
