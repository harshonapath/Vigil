import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Clock,
  RotateCcw,
  Loader2,
  AlertTriangle,
  GitPullRequest,
  ArrowRight,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useGitHub } from '../contexts/GitHubContext';
import { repositoryService } from '../services/repositoryService';
import { pullRequestService } from '../services/pullRequestService';
import { reviewService } from '../services/reviewService';
import { findingService } from '../services/findingService';
import type { ReviewRead, FindingRead } from '../types';

export interface HistoryItem {
  id: string;
  repo: string;
  repoFullName: string;
  prNumber: number;
  prInternalId: string;
  prTitle: string;
  status: string;
  timestamp: string;
  findingCount: number;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  summary: string;
  rawReview?: ReviewRead;
}

export default function ReviewHistory() {
  const navigate = useNavigate();
  const { installationId } = useGitHub();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'published' | 'ready' | 'draft' | 'failed'>('all');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      setError('');

      try {
        const repoRes = await repositoryService.getMyRepositories(1, 20, installationId);
        if (cancelled) return;

        if (repoRes.items.length === 0) {
          setReviews([]);
          return;
        }

        const historyItems: HistoryItem[] = [];

        for (const repo of repoRes.items) {
          try {
            const prRes = await pullRequestService.getPullRequestsForRepository(repo.id, 1, 30);
            if (cancelled) return;

            for (const pr of prRes.items) {
              try {
                // Fetch PR findings and review
                const [findingsRes, reviewData] = await Promise.allSettled([
                  findingService.getFindingsForPR(pr.id),
                  reviewService.getReviewForPR(pr.id),
                ]);

                const findings: FindingRead[] =
                  findingsRes.status === 'fulfilled' ? findingsRes.value.items : [];
                const review: ReviewRead | null =
                  reviewData.status === 'fulfilled' ? reviewData.value : null;

                const sevCounts = {
                  critical: findings.filter(f => f.severity.toUpperCase() === 'CRITICAL').length,
                  high: findings.filter(f => f.severity.toUpperCase() === 'HIGH').length,
                  medium: findings.filter(f => f.severity.toUpperCase() === 'MEDIUM').length,
                  low: findings.filter(f => f.severity.toUpperCase() === 'LOW').length,
                };

                const dateStr = review?.created_at || pr.created_at;
                const formattedDate = new Date(dateStr).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const statusLower = (review?.status || pr.status || 'draft').toLowerCase();

                historyItems.push({
                  id: review?.id || pr.id,
                  repo: repo.name,
                  repoFullName: repo.full_name,
                  prNumber: pr.pr_number,
                  prInternalId: pr.id,
                  prTitle: pr.title,
                  status: statusLower,
                  timestamp: formattedDate,
                  findingCount: findings.length,
                  severityCounts: sevCounts,
                  summary:
                    review?.summary ||
                    (findings.length > 0
                      ? `${findings.length} security finding${findings.length === 1 ? '' : 's'} identified across synchronized files.`
                      : 'Security scan complete — no active vulnerabilities found.'),
                  rawReview: review || undefined,
                });
              } catch {
                // PR had no review records yet; continue
              }
            }
          } catch {
            // continue
          }
        }

        if (cancelled) return;
        setReviews(historyItems);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load review history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [installationId, refreshTick]);

  const filtered = reviews.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'published') return r.status === 'published';
    if (filter === 'ready') return r.status === 'ready';
    if (filter === 'draft') return r.status === 'draft';
    if (filter === 'failed') return r.status === 'publish_failed' || r.status === 'failed';
    return true;
  });

  return (
    <div className="stage3-page" style={{ padding: '32px 36px', maxWidth: '1200px' }}>
      <PageHeader
        title="Review History"
        subtitle="Chronological audit log of automated and human security reviews"
        actions={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRefreshTick(t => t + 1)}
            title="Refresh history"
          >
            <RotateCcw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        }
      />

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted-foreground)' }}>
          <Loader2 size={24} className="animate-spin" style={{ display: 'inline-block', marginBottom: 12 }} />
          <div>Loading review history from backend…</div>
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
        <>
          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {(['all', 'published', 'ready', 'draft', 'failed'] as const).map(tab => {
              const active = filter === tab;
              const count =
                tab === 'all'
                  ? reviews.length
                  : reviews.filter(r => {
                      if (tab === 'failed') return r.status === 'publish_failed' || r.status === 'failed';
                      return r.status === tab;
                    }).length;

              return (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: active ? '600' : '400',
                    cursor: 'pointer',
                    background: active ? 'var(--secondary)' : 'transparent',
                    border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
                    color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    textTransform: 'capitalize',
                  }}
                >
                  {tab}
                  <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>({count})</span>
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <GitPullRequest size={36} style={{ color: 'var(--muted-foreground)', marginBottom: 12 }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px' }}>
                No review history found
              </h3>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '0.85rem', margin: '0 0 18px' }}>
                Pull request reviews and analysis summaries will appear here once executed.
              </p>
              <button className="btn btn-primary" onClick={() => navigate('/pull-requests')}>
                View Pull Requests
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filtered.map(item => {
                const isPublished = item.status === 'published';
                const isReady = item.status === 'ready';
                const isFailed = item.status === 'publish_failed' || item.status === 'failed';

                return (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)' }}>
                          {item.repoFullName}
                        </span>
                        <span style={{ color: 'var(--border)' }}>·</span>
                        <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--foreground)' }}>
                          PR #{item.prNumber} {item.prTitle}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isPublished && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'color-mix(in srgb, var(--status-safe) 12%, transparent)', color: 'var(--status-safe)', border: '1px solid color-mix(in srgb, var(--status-safe) 30%, transparent)' }}>
                            <CheckCircle size={11} /> Published to GitHub
                          </span>
                        )}
                        {isReady && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)', border: '1px solid color-mix(in srgb, var(--primary) 30%, transparent)' }}>
                            <Clock size={11} /> Review Ready
                          </span>
                        )}
                        {isFailed && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'color-mix(in srgb, var(--status-critical) 12%, transparent)', color: 'var(--status-critical)', border: '1px solid color-mix(in srgb, var(--status-critical) 30%, transparent)' }}>
                            <AlertTriangle size={11} /> Publish Failed
                          </span>
                        )}
                        {!isPublished && !isReady && !isFailed && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--secondary)', color: 'var(--muted-foreground)', border: '1px solid var(--border)', textTransform: 'uppercase' }}>
                            {item.status}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                          {item.timestamp}
                        </span>
                      </div>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--secondary-foreground)', lineHeight: '1.6' }}>
                      {item.summary}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--muted-foreground)' }}>
                          Findings: <strong>{item.findingCount}</strong>
                        </span>
                        {item.severityCounts.critical > 0 && (
                          <span style={{ color: 'var(--status-critical)', fontWeight: 600 }}>
                            {item.severityCounts.critical} Critical
                          </span>
                        )}
                        {item.severityCounts.high > 0 && (
                          <span style={{ color: 'var(--status-high)', fontWeight: 600 }}>
                            {item.severityCounts.high} High
                          </span>
                        )}
                        {item.severityCounts.medium > 0 && (
                          <span style={{ color: 'var(--status-warn)', fontWeight: 500 }}>
                            {item.severityCounts.medium} Medium
                          </span>
                        )}
                        {item.severityCounts.low > 0 && (
                          <span style={{ color: 'var(--status-low)' }}>
                            {item.severityCounts.low} Low
                          </span>
                        )}
                      </div>

                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/pull-requests/${item.prInternalId}`)}
                      >
                        Inspect Review <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
