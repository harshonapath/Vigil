import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle,
  Loader2,
  RotateCcw,
  GitFork,
  Zap,
  TriangleAlert,
  Lock,
  Layers,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useGitHub } from '../contexts/GitHubContext';
import { repositoryService } from '../services/repositoryService';
import { pullRequestService } from '../services/pullRequestService';
import { findingService } from '../services/findingService';
import { FindingCard } from '../components/findings/FindingCard';
import type { FindingRead, RepositoryRead } from '../types';

export interface FindingWithContext extends FindingRead {
  repoName: string;
  repoFullName: string;
  prNumber: number;
  prId: string;
  prTitle: string;
}

export default function Findings() {
  const navigate = useNavigate();
  const { installationId } = useGitHub();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [findings, setFindings] = useState<FindingWithContext[]>([]);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'PROMPT_INJECTION' | 'COMPLEXITY' | 'EDGE_CASE' | 'SECURITY_ASSUMPTION'>('all');
  const [activeRepo, setActiveRepo] = useState<RepositoryRead | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadFindings = async () => {
      setLoading(true);
      setError('');

      try {
        const repoRes = await repositoryService.getMyRepositories(1, 20, installationId);
        if (cancelled) return;

        if (repoRes.items.length === 0) {
          setFindings([]);
          setActiveRepo(null);
          return;
        }

        const repo = repoRes.items[0];
        setActiveRepo(repo);

        const allFindings: FindingWithContext[] = [];

        for (const r of repoRes.items) {
          try {
            const prRes = await pullRequestService.getPullRequestsForRepository(r.id, 1, 20);
            if (cancelled) return;

            for (const pr of prRes.items) {
              try {
                const fRes = await findingService.getFindingsForPR(pr.id);
                for (const f of fRes.items) {
                  allFindings.push({
                    ...f,
                    repoName: r.name,
                    repoFullName: r.full_name,
                    prNumber: pr.pr_number,
                    prId: pr.id,
                    prTitle: pr.title,
                  });
                }
              } catch {
                // PR has no findings yet; continue
              }
            }
          } catch {
            // continue
          }
        }

        if (cancelled) return;
        setFindings(allFindings);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load security findings');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFindings();
    return () => {
      cancelled = true;
    };
  }, [installationId, refreshTick]);

  // Filter findings
  const filtered = findings.filter(f => {
    const sevMatch =
      severityFilter === 'all' || f.severity.toLowerCase() === severityFilter.toLowerCase();
    const catMatch =
      categoryFilter === 'all' || f.category.toUpperCase() === categoryFilter.toUpperCase();
    return sevMatch && catMatch;
  });

  const severityCounts = {
    critical: findings.filter(f => f.severity.toUpperCase() === 'CRITICAL').length,
    high: findings.filter(f => f.severity.toUpperCase() === 'HIGH').length,
    medium: findings.filter(f => f.severity.toUpperCase() === 'MEDIUM').length,
    low: findings.filter(f => f.severity.toUpperCase() === 'LOW').length,
  };

  const categoryCounts = {
    promptInjection: findings.filter(f => f.category.toUpperCase() === 'PROMPT_INJECTION').length,
    complexity: findings.filter(f => f.category.toUpperCase() === 'COMPLEXITY').length,
    edgeCase: findings.filter(f => f.category.toUpperCase() === 'EDGE_CASE').length,
    securityAssumption: findings.filter(f => f.category.toUpperCase() === 'SECURITY_ASSUMPTION').length,
  };

  return (
    <div className="stage3-page" style={{ padding: '32px 36px', maxWidth: '1200px' }}>
      <PageHeader
        title="Security Findings"
        subtitle={
          activeRepo
            ? `${findings.length} findings detected across ${activeRepo.full_name} · Real-time AI security & code analysis`
            : 'Security findings across connected repositories'
        }
        actions={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRefreshTick(t => t + 1)}
            title="Refresh findings"
          >
            <RotateCcw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginBottom: 12 }} />
          <div>Loading security findings from backend…</div>
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
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px' }}>
            No GitHub repositories connected
          </h3>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', margin: '0 0 18px' }}>
            Connect a GitHub repository to begin automated security analysis and surface findings.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/connect')}>
            <GitFork size={14} /> Connect GitHub
          </button>
        </div>
      )}

      {!loading && !error && activeRepo && findings.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <CheckCircle size={36} style={{ color: 'var(--status-safe)', marginBottom: 12 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px' }}>
            No security findings detected
          </h3>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', margin: '0 0 18px' }}>
            No security findings have been detected for {activeRepo.full_name}. Pull requests will be scanned automatically when opened or analyzed.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/pull-requests')}>
            View Pull Requests
          </button>
        </div>
      )}

      {!loading && !error && findings.length > 0 && (
        <>
          {/* Core Feature Category Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setCategoryFilter('all')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: categoryFilter === 'all' ? 600 : 400,
                cursor: 'pointer',
                background: categoryFilter === 'all' ? 'var(--secondary)' : 'transparent',
                border: `1px solid ${categoryFilter === 'all' ? 'var(--border)' : 'transparent'}`,
                color: categoryFilter === 'all' ? 'var(--foreground)' : 'var(--muted-foreground)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Layers size={13} /> All Categories ({findings.length})
            </button>

            <button
              onClick={() => setCategoryFilter('PROMPT_INJECTION')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: categoryFilter === 'PROMPT_INJECTION' ? 600 : 400,
                cursor: 'pointer',
                background: categoryFilter === 'PROMPT_INJECTION' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                border: `1px solid ${categoryFilter === 'PROMPT_INJECTION' ? 'rgba(239, 68, 68, 0.4)' : 'transparent'}`,
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ShieldAlert size={13} /> Prompt Injection ({categoryCounts.promptInjection})
            </button>

            <button
              onClick={() => setCategoryFilter('COMPLEXITY')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: categoryFilter === 'COMPLEXITY' ? 600 : 400,
                cursor: 'pointer',
                background: categoryFilter === 'COMPLEXITY' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                border: `1px solid ${categoryFilter === 'COMPLEXITY' ? 'rgba(245, 158, 11, 0.4)' : 'transparent'}`,
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Zap size={13} /> Complexity ({categoryCounts.complexity})
            </button>

            <button
              onClick={() => setCategoryFilter('EDGE_CASE')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: categoryFilter === 'EDGE_CASE' ? 600 : 400,
                cursor: 'pointer',
                background: categoryFilter === 'EDGE_CASE' ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                border: `1px solid ${categoryFilter === 'EDGE_CASE' ? 'rgba(6, 182, 212, 0.4)' : 'transparent'}`,
                color: '#22d3ee',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <TriangleAlert size={13} /> Edge Cases ({categoryCounts.edgeCase})
            </button>

            <button
              onClick={() => setCategoryFilter('SECURITY_ASSUMPTION')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: categoryFilter === 'SECURITY_ASSUMPTION' ? 600 : 400,
                cursor: 'pointer',
                background: categoryFilter === 'SECURITY_ASSUMPTION' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                border: `1px solid ${categoryFilter === 'SECURITY_ASSUMPTION' ? 'rgba(168, 85, 247, 0.4)' : 'transparent'}`,
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Lock size={13} /> Security Assumptions ({categoryCounts.securityAssumption})
            </button>
          </div>

          {/* Severity summary pills */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            {(['critical', 'high', 'medium', 'low'] as const).map(s => {
              const count = severityCounts[s];
              const active = severityFilter === s;
              const color =
                s === 'critical'
                  ? 'var(--severity-critical)'
                  : s === 'high'
                  ? 'var(--severity-high)'
                  : s === 'medium'
                  ? 'var(--severity-medium)'
                  : 'var(--severity-low)';

              return (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(active ? 'all' : s)}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: 'var(--card)',
                    border: `1px solid ${active ? color : 'var(--border)'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 150ms',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
                    {s}
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: count > 0 ? color : 'var(--muted-foreground)', fontFamily: 'var(--font-mono)' }}>
                    {count}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Findings List using FindingCard with category-specific styles */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <Info size={24} style={{ color: 'var(--muted-foreground)', marginBottom: 8, display: 'inline-block' }} />
              <div style={{ fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: 500 }}>
                No findings match the current filter criteria
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => {
                  setCategoryFilter('all');
                  setSeverityFilter('all');
                }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filtered.map(finding => (
                <div key={finding.id}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginBottom: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span>{finding.repoName}</span>
                    <span>·</span>
                    <span
                      style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => navigate(`/pull-requests/${finding.prId}`)}
                    >
                      PR #{finding.prNumber} {finding.prTitle}
                    </span>
                  </div>
                  <FindingCard finding={finding} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
