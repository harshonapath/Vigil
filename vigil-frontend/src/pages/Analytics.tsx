import { useEffect, useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  GitPullRequest,
  GitCommit,
  GitFork,
  RotateCcw,
  Loader2,
  Lock,
  Zap,
  TriangleAlert,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useGitHub } from '../contexts/GitHubContext';
import { repositoryService } from '../services/repositoryService';
import { pullRequestService } from '../services/pullRequestService';
import { findingService } from '../services/findingService';
import { commitService } from '../services/commitService';
import { reviewService } from '../services/reviewService';
import type { FindingRead } from '../types';

interface RepoAnalyticsSummary {
  id: string;
  name: string;
  fullName: string;
  prCount: number;
  commitCount: number;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  verifiedCount: number;
}

interface AnalyticsState {
  totalRepos: number;
  totalPRs: number;
  totalCommits: number;
  totalReviews: number;
  totalFindings: number;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  categoryCounts: {
    promptInjection: number;
    complexity: number;
    edgeCase: number;
    securityAssumption: number;
    other: number;
  };
  statusCounts: {
    open: number;
    verified: number;
    dismissed: number;
  };
  repos: RepoAnalyticsSummary[];
}

export default function Analytics() {
  const { installationId } = useGitHub();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalyticsState>({
    totalRepos: 0,
    totalPRs: 0,
    totalCommits: 0,
    totalReviews: 0,
    totalFindings: 0,
    severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    categoryCounts: { promptInjection: 0, complexity: 0, edgeCase: 0, securityAssumption: 0, other: 0 },
    statusCounts: { open: 0, verified: 0, dismissed: 0 },
    repos: [],
  });
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      setLoading(true);
      setError('');

      try {
        const repoRes = await repositoryService.getMyRepositories(1, 20, installationId);
        if (cancelled) return;

        if (repoRes.items.length === 0) {
          setData({
            totalRepos: 0,
            totalPRs: 0,
            totalCommits: 0,
            totalReviews: 0,
            totalFindings: 0,
            severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
            categoryCounts: { promptInjection: 0, complexity: 0, edgeCase: 0, securityAssumption: 0, other: 0 },
            statusCounts: { open: 0, verified: 0, dismissed: 0 },
            repos: [],
          });
          return;
        }

        let prTotal = 0;
        let commitTotal = 0;
        let reviewTotal = 0;
        const allFindings: FindingRead[] = [];
        const repoSummaries: RepoAnalyticsSummary[] = [];

        for (const repo of repoRes.items) {
          try {
            const prRes = await pullRequestService.getPullRequestsForRepository(repo.id, 1, 30);
            if (cancelled) return;

            prTotal += prRes.items.length;
            let repoCommits = 0;
            const repoFindings: FindingRead[] = [];

            for (const pr of prRes.items) {
              // Commits
              try {
                const cRes = await commitService.getCommitsForPR(pr.id, 1, 50);
                repoCommits += cRes.items.length;
              } catch {
                // ignore
              }

              // Findings
              try {
                const fRes = await findingService.getFindingsForPR(pr.id);
                repoFindings.push(...fRes.items);
                allFindings.push(...fRes.items);
              } catch {
                // ignore
              }

              // Review
              try {
                const r = await reviewService.getReviewForPR(pr.id);
                if (r) reviewTotal++;
              } catch {
                // ignore
              }
            }

            commitTotal += repoCommits;

            repoSummaries.push({
              id: repo.id,
              name: repo.name,
              fullName: repo.full_name,
              prCount: prRes.items.length,
              commitCount: repoCommits,
              findingCount: repoFindings.length,
              criticalCount: repoFindings.filter(f => f.severity.toUpperCase() === 'CRITICAL').length,
              highCount: repoFindings.filter(f => f.severity.toUpperCase() === 'HIGH').length,
              mediumCount: repoFindings.filter(f => f.severity.toUpperCase() === 'MEDIUM').length,
              lowCount: repoFindings.filter(f => f.severity.toUpperCase() === 'LOW').length,
              verifiedCount: repoFindings.filter(f => f.status.toUpperCase() === 'VERIFIED').length,
            });
          } catch {
            // continue
          }
        }

        if (cancelled) return;

        // Group findings
        const sev = {
          critical: allFindings.filter(f => f.severity.toUpperCase() === 'CRITICAL').length,
          high: allFindings.filter(f => f.severity.toUpperCase() === 'HIGH').length,
          medium: allFindings.filter(f => f.severity.toUpperCase() === 'MEDIUM').length,
          low: allFindings.filter(f => f.severity.toUpperCase() === 'LOW').length,
        };

        const cat = {
          promptInjection: allFindings.filter(f => f.category.toUpperCase() === 'PROMPT_INJECTION').length,
          complexity: allFindings.filter(f => f.category.toUpperCase() === 'COMPLEXITY').length,
          edgeCase: allFindings.filter(f => f.category.toUpperCase() === 'EDGE_CASE').length,
          securityAssumption: allFindings.filter(f => f.category.toUpperCase() === 'SECURITY_ASSUMPTION').length,
          other: allFindings.filter(
            f =>
              !['PROMPT_INJECTION', 'COMPLEXITY', 'EDGE_CASE', 'SECURITY_ASSUMPTION'].includes(
                f.category.toUpperCase()
              )
          ).length,
        };

        const stat = {
          open: allFindings.filter(f => ['OPEN', 'PENDING', 'PENDING_REVIEW'].includes(f.status.toUpperCase())).length,
          verified: allFindings.filter(f => f.status.toUpperCase() === 'VERIFIED').length,
          dismissed: allFindings.filter(f => ['REJECTED', 'DISMISSED', 'FALSE_POSITIVE'].includes(f.status.toUpperCase())).length,
        };

        setData({
          totalRepos: repoRes.items.length,
          totalPRs: prTotal,
          totalCommits: commitTotal,
          totalReviews: reviewTotal,
          totalFindings: allFindings.length,
          severityCounts: sev,
          categoryCounts: cat,
          statusCounts: stat,
          repos: repoSummaries,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to calculate analytics metrics');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [installationId, refreshTick]);

  return (
    <div className="stage3-page" style={{ padding: '32px 36px', maxWidth: '1200px' }}>
      <PageHeader
        title="Analytics & Security Insights"
        subtitle="Real-time security metrics derived from synchronized repositories, pull requests, and commit analyses"
        actions={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRefreshTick(t => t + 1)}
            title="Refresh analytics"
          >
            <RotateCcw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginBottom: 12 }} />
          <div>Aggregating real analytics from backend…</div>
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

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Top high-level KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted-foreground)', fontSize: '0.78rem', marginBottom: '8px' }}>
                <GitFork size={14} />
                <span>Active Repositories</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--foreground)' }}>
                {data.totalRepos}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                Connected via GitHub App
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted-foreground)', fontSize: '0.78rem', marginBottom: '8px' }}>
                <GitPullRequest size={14} />
                <span>Pull Requests</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--foreground)' }}>
                {data.totalPRs}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                {data.totalReviews} reviews completed
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted-foreground)', fontSize: '0.78rem', marginBottom: '8px' }}>
                <GitCommit size={14} />
                <span>Synchronized Commits</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--foreground)' }}>
                {data.totalCommits}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                Scanned via commit analysis
              </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--muted-foreground)', fontSize: '0.78rem', marginBottom: '8px' }}>
                <ShieldAlert size={14} />
                <span>Total Findings</span>
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: data.totalFindings > 0 ? 'var(--status-warn)' : 'var(--status-safe)' }}>
                {data.totalFindings}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                {data.statusCounts.verified} human-verified
              </div>
            </div>
          </div>

          {/* Finding Categories Breakdown */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)' }}>
              Core Vigil Feature Detections
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {/* Prompt Injection */}
              <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 600, fontSize: '0.8rem', marginBottom: '6px' }}>
                  <ShieldAlert size={14} />
                  <span>Prompt Injection</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fca5a5' }}>
                  {data.categoryCounts.promptInjection}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                  AI manipulation attempts detected
                </div>
              </div>

              {/* Complexity Analysis */}
              <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 600, fontSize: '0.8rem', marginBottom: '6px' }}>
                  <Zap size={14} />
                  <span>Complexity Analysis</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fde68a' }}>
                  {data.categoryCounts.complexity}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                  Algorithmic bottlenecks flagged
                </div>
              </div>

              {/* Edge Case Analysis */}
              <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.06)', border: '1px solid rgba(6, 182, 212, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22d3ee', fontWeight: 600, fontSize: '0.8rem', marginBottom: '6px' }}>
                  <TriangleAlert size={14} />
                  <span>Edge Case Analysis</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#a5f3fc' }}>
                  {data.categoryCounts.edgeCase}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                  Unhandled failure modes isolated
                </div>
              </div>

              {/* Security Assumptions */}
              <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', fontWeight: 600, fontSize: '0.8rem', marginBottom: '6px' }}>
                  <Lock size={14} />
                  <span>Security Assumptions</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#e9d5ff' }}>
                  {data.categoryCounts.securityAssumption}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                  Security invariant regressions identified
                </div>
              </div>
            </div>
          </div>

          {/* Severity & Verification split */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Severity Breakdown */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>
                Severity Distribution
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--status-critical)' }}>Critical</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{data.severityCounts.critical}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--status-high)' }}>High</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{data.severityCounts.high}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--status-warn)' }}>Medium</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{data.severityCounts.medium}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--status-low)' }}>Low</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{data.severityCounts.low}</span>
                </div>
              </div>
            </div>

            {/* Verification Status */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>
                Human Verification Triage
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Awaiting Review / Open</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{data.statusCounts.open}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--status-safe)' }}>Verified & Confirmed</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{data.statusCounts.verified}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>Dismissed / False Positive</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{data.statusCounts.dismissed}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Repositories Activity Table */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
            <h4 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>
              Connected Repositories Breakdown
            </h4>
            {data.repos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted-foreground)', fontSize: '0.85rem' }}>
                No active repositories found.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted-foreground)' }}>
                      <th style={{ padding: '8px 12px' }}>Repository</th>
                      <th style={{ padding: '8px 12px' }}>PRs</th>
                      <th style={{ padding: '8px 12px' }}>Commits</th>
                      <th style={{ padding: '8px 12px' }}>Findings</th>
                      <th style={{ padding: '8px 12px' }}>Critical</th>
                      <th style={{ padding: '8px 12px' }}>High</th>
                      <th style={{ padding: '8px 12px' }}>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.repos.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--foreground)' }}>
                          {r.fullName}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{r.prCount}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{r.commitCount}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>{r.findingCount}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: r.criticalCount > 0 ? 'var(--status-critical)' : 'inherit' }}>
                          {r.criticalCount}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: r.highCount > 0 ? 'var(--status-high)' : 'inherit' }}>
                          {r.highCount}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: r.verifiedCount > 0 ? 'var(--status-safe)' : 'inherit' }}>
                          {r.verifiedCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
