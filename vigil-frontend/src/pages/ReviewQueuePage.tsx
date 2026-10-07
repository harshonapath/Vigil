import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  GitPullRequest,
  Clock,
  CheckCircle,
  Loader2,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  XCircle,
  Ban,
  FileCode,
} from 'lucide-react';
import { reviewQueueService } from '../services/reviewQueueService';
import { findingService } from '../services/findingService';
import type { ReviewQueueItem, FindingQueueItem } from '../types';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Card, CardContent } from '../components/common/Card';
import { SeverityBadge } from '../components/findings/SeverityBadge';
import { cn } from '../lib/utils';

// Derive summary counts from REAL backend data only
interface QueueSummary {
  total: number;
  analyzing: number;
  reviewReady: number;
  humanReviewNeeded: number;
  notAnalyzed: number;
}

function computeSummary(items: ReviewQueueItem[]): QueueSummary {
  let analyzing = 0;
  let reviewReady = 0;
  let humanReviewNeeded = 0;
  let notAnalyzed = 0;

  for (const item of items) {
    const as = (item.latest_analysis_status || '').toUpperCase();
    const rs = (item.latest_review_status || '').toUpperCase();

    if (!item.latest_analysis_id) {
      notAnalyzed++;
    } else if (as === 'QUEUED' || as === 'RUNNING') {
      analyzing++;
    } else if (as === 'COMPLETED') {
      if (rs === 'READY') reviewReady++;
      else humanReviewNeeded++;
    }
  }

  return {
    total: items.length,
    analyzing,
    reviewReady,
    humanReviewNeeded,
    notAnalyzed,
  };
}

function getAnalysisStatusBadge(status: string | null) {
  if (!status) return <Badge variant="secondary" className="text-[10px] py-0">Not Analyzed</Badge>;
  switch (status.toUpperCase()) {
    case 'QUEUED':
      return <Badge variant="secondary" className="text-[10px] py-0 gap-1"><Clock className="w-2.5 h-2.5" />Queued</Badge>;
    case 'RUNNING':
      return <Badge variant="info" className="text-[10px] py-0 gap-1 animate-pulse"><Loader2 className="w-2.5 h-2.5 animate-spin" />Analyzing</Badge>;
    case 'COMPLETED':
      return <Badge variant="success" className="text-[10px] py-0 gap-1"><CheckCircle className="w-2.5 h-2.5" />Completed</Badge>;
    case 'FAILED':
      return <Badge variant="critical" className="text-[10px] py-0 gap-1"><AlertTriangle className="w-2.5 h-2.5" />Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] py-0">{status}</Badge>;
  }
}

function getReviewStatusBadge(status: string | null) {
  if (!status) return null;
  switch (status.toUpperCase()) {
    case 'DRAFT':
      return <Badge variant="secondary" className="text-[10px] py-0">Draft</Badge>;
    case 'READY':
      return <Badge variant="info" className="text-[10px] py-0">Review Ready</Badge>;
    case 'PUBLISHED':
      return <Badge variant="success" className="text-[10px] py-0">Published</Badge>;
    case 'PUBLISH_FAILED':
      return <Badge variant="critical" className="text-[10px] py-0">Publish Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] py-0">{status}</Badge>;
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffMins = Math.floor(diffMs / 60000);
  if (diffDays > 30) return date.toLocaleDateString();
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
}

export const ReviewQueuePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'findings' | 'pull_requests'>('findings');

  // PR Queue items
  const [items, setItems] = useState<ReviewQueueItem[]>([]);

  // Finding Queue items
  const [findingQueue, setFindingQueue] = useState<FindingQueueItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<string>('ALL');
  const [refreshTick, setRefreshTick] = useState(0);
  const mountedRef = useRef(true);

  // Verification in-flight IDs
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const [prRes, fRes] = await Promise.allSettled([
          reviewQueueService.getReviewQueue(1, 50),
          findingService.getFindingsReviewQueue({ page: 1, pageSize: 50 }),
        ]);

        if (!mountedRef.current) return;

        if (prRes.status === 'fulfilled') {
          setItems(prRes.value.items);
        }

        if (fRes.status === 'fulfilled') {
          setFindingQueue(fRes.value.items);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load review queue');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    void run();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshTick]);

  const handleRefresh = () => setRefreshTick(t => t + 1);

  const handleVerify = async (
    findingId: string,
    decision: 'VERIFIED' | 'REJECTED' | 'DISMISSED',
    comment?: string
  ) => {
    setVerifyingId(findingId);
    setActionError('');
    try {
      await findingService.verifyFinding(findingId, decision, comment);
      // Refresh the queue immediately so the item updates
      handleRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Verification action failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const summary = computeSummary(items);

  const filteredPRItems = items.filter(item => {
    if (filter === 'ALL') return true;
    const as = (item.latest_analysis_status || '').toUpperCase();
    const rs = (item.latest_review_status || '').toUpperCase();
    if (filter === 'ANALYZING') return as === 'QUEUED' || as === 'RUNNING';
    if (filter === 'REVIEW_READY') return as === 'COMPLETED' && rs === 'READY';
    if (filter === 'NOT_ANALYZED') return !item.latest_analysis_id;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitPullRequest className="w-5 h-5 text-slate-400" />
            <h1 className="text-xl font-bold text-slate-100">Review Queue & Human Verification</h1>
          </div>
          <p className="text-sm text-slate-400">
            Audit and verify AI-generated security findings, or monitor pull requests pending analysis.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<RotateCcw className="w-3.5 h-3.5" />}
          onClick={handleRefresh}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('findings')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2',
            activeTab === 'findings'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          )}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Findings Awaiting Verification ({findingQueue.length})
        </button>

        <button
          onClick={() => setActiveTab('pull_requests')}
          className={cn(
            'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2',
            activeTab === 'pull_requests'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          )}
        >
          <GitPullRequest className="w-3.5 h-3.5" />
          Pull Requests Queue ({items.length})
        </button>
      </div>

      {actionError && (
        <div className="p-3 bg-red-950/40 border border-red-800 rounded-lg text-xs text-red-300 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="underline text-red-200">
            Dismiss
          </button>
        </div>
      )}

      {/* States */}
      {loading && <LoadingState message="Loading review queue from backend…" />}

      {!loading && error && (
        <ErrorState title="Failed to load review queue" message={error} onRetry={handleRefresh} />
      )}

      {/* Tab: Findings Awaiting Verification */}
      {!loading && !error && activeTab === 'findings' && (
        <div className="space-y-4">
          {findingQueue.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="w-7 h-7 text-emerald-400" />}
              title="Verification queue is clear"
              description="All detected security findings have been verified, or no findings are currently pending human review."
            />
          ) : (
            <div className="space-y-3">
              {findingQueue.map(item => {
                const inFlight = verifyingId === item.finding_id;

                return (
                  <Card key={item.finding_id} className="transition-all hover:border-slate-700/80">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <SeverityBadge severity={item.severity} />
                            <Badge variant="outline" className="text-[10px] py-0 uppercase">
                              {item.category}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] py-0 uppercase">
                              {item.status}
                            </Badge>
                            <span className="text-xs text-slate-500 font-mono">
                              {item.finding_id.slice(0, 8)}
                            </span>
                          </div>

                          <h4 className="text-sm font-semibold text-slate-100 mb-2 leading-snug">
                            {item.title}
                          </h4>

                          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                            {item.file_path && (
                              <div className="flex items-center gap-1 font-mono">
                                <FileCode className="w-3.5 h-3.5 text-slate-500" />
                                <span>{item.file_path}</span>
                                {item.start_line && <span>:L{item.start_line}</span>}
                              </div>
                            )}
                            {item.repository_full_name && (
                              <span>{item.repository_full_name}</span>
                            )}
                            {item.pull_request_number && (
                              <span>PR #{item.pull_request_number}</span>
                            )}
                            <span className="text-slate-500">
                              {formatRelativeTime(item.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="primary"
                            size="sm"
                            loading={inFlight}
                            icon={<CheckCircle className="w-3.5 h-3.5" />}
                            onClick={() => handleVerify(item.finding_id, 'VERIFIED')}
                          >
                            Verify
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={inFlight}
                            icon={<XCircle className="w-3.5 h-3.5" />}
                            onClick={() => handleVerify(item.finding_id, 'REJECTED')}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={inFlight}
                            icon={<Ban className="w-3.5 h-3.5" />}
                            onClick={() =>
                              handleVerify(item.finding_id, 'DISMISSED', 'False positive')
                            }
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Pull Requests Queue */}
      {!loading && !error && activeTab === 'pull_requests' && (
        <>
          {/* Summary stats — all derived from real data */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              label="Total in Queue"
              value={summary.total > 0 ? String(summary.total) : '—'}
              description="Active pull requests"
              icon={<GitPullRequest className="w-4 h-4 text-slate-400" />}
              active={filter === 'ALL'}
              onClick={() => setFilter('ALL')}
            />
            <SummaryCard
              label="Analyzing"
              value={summary.analyzing > 0 ? String(summary.analyzing) : '—'}
              description="Running AI analysis"
              icon={<Loader2 className={cn('w-4 h-4 text-indigo-400', summary.analyzing > 0 && 'animate-spin')} />}
              active={filter === 'ANALYZING'}
              onClick={() => setFilter(filter === 'ANALYZING' ? 'ALL' : 'ANALYZING')}
              highlight={summary.analyzing > 0 ? 'indigo' : undefined}
            />
            <SummaryCard
              label="Review Ready"
              value={summary.reviewReady > 0 ? String(summary.reviewReady) : '—'}
              description="Awaiting human review"
              icon={<CheckCircle className="w-4 h-4 text-emerald-400" />}
              active={filter === 'REVIEW_READY'}
              onClick={() => setFilter(filter === 'REVIEW_READY' ? 'ALL' : 'REVIEW_READY')}
              highlight={summary.reviewReady > 0 ? 'emerald' : undefined}
            />
            <SummaryCard
              label="Not Analyzed"
              value={summary.notAnalyzed > 0 ? String(summary.notAnalyzed) : '—'}
              description="Pending first analysis"
              icon={<Clock className="w-4 h-4 text-amber-400" />}
              active={filter === 'NOT_ANALYZED'}
              onClick={() => setFilter(filter === 'NOT_ANALYZED' ? 'ALL' : 'NOT_ANALYZED')}
              highlight={summary.notAnalyzed > 0 ? 'amber' : undefined}
            />
          </div>

          {/* Queue items */}
          {filteredPRItems.length === 0 ? (
            <EmptyState
              icon={<GitPullRequest className="w-6 h-6" />}
              title={filter === 'ALL' ? 'Review queue is empty' : 'No items match this filter'}
              description={
                filter === 'ALL'
                  ? 'No pull requests are currently in the review queue. PRs appear here when they have pending analyses or reviews.'
                  : 'Try clearing the filter to see all queue items.'
              }
              action={
                filter !== 'ALL' ? (
                  <Button variant="ghost" size="sm" onClick={() => setFilter('ALL')}>
                    Show All
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-2.5">
              {filteredPRItems.map(item => (
                <QueueItemRow key={item.pull_request.id} item={item} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  label: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  highlight?: 'indigo' | 'emerald' | 'amber';
}> = ({ label, value, description, icon, active, onClick, highlight }) => {
  const highlightBorder: Record<string, string> = {
    indigo: 'border-indigo-500/40',
    emerald: 'border-emerald-500/30',
    amber: 'border-amber-500/30',
  };
  const activeBorder = active ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'p-4 rounded-xl border bg-slate-900/60 text-left transition-all hover:border-slate-700 hover:bg-slate-900 w-full',
        highlight ? highlightBorder[highlight] : 'border-slate-800',
        activeBorder
      )}
    >
      <div className="flex items-center justify-between mb-2">
        {icon}
        {active && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
      </div>
      <p className={cn(
        'text-2xl font-bold tabular-nums',
        value === '—' ? 'text-slate-600' : 'text-slate-100'
      )}>
        {value}
      </p>
      <p className="text-xs font-medium text-slate-300 mt-0.5">{label}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
    </button>
  );
};

const QueueItemRow: React.FC<{ item: ReviewQueueItem }> = ({ item }) => {
  const pr = item.pull_request;
  const needsAttention = item.latest_review_status?.toUpperCase() === 'READY';

  return (
    <Card className={cn(
      'transition-all hover:border-slate-700/80',
      needsAttention && 'border-indigo-900/50'
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Status indicator */}
          <div className={cn(
            'shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center border',
            needsAttention
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          )}>
            <GitPullRequest className="w-4 h-4" />
          </div>

          {/* PR info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-mono text-slate-500">#{pr.pr_number}</span>
                  <h4 className="text-sm font-semibold text-slate-100 truncate">{pr.title}</h4>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">
                    {pr.source_branch}
                  </div>
                  <span className="text-slate-600 text-xs">→</span>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">
                    {pr.target_branch}
                  </div>
                  <span className="text-xs text-slate-500">by {pr.author_login}</span>
                  {item.queued_at && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(item.queued_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {getAnalysisStatusBadge(item.latest_analysis_status)}
                {getReviewStatusBadge(item.latest_review_status)}
                {pr.status && (
                  <Badge
                    variant={pr.status.toUpperCase() === 'OPEN' ? 'success' : 'secondary'}
                    className="text-[10px] py-0 uppercase"
                  >
                    {pr.status}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="shrink-0 ml-1">
            <Link to={`/pull-requests/${pr.id}`}>
              <Button
                variant={needsAttention ? 'primary' : 'outline'}
                size="sm"
                icon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                {needsAttention ? 'Review Now' : 'Open'}
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
