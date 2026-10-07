import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import {
  ChevronLeft, Cpu, Shield, GitCommit, FileText, Send,
  RotateCcw, CheckCircle, AlertTriangle, Loader2, Clock, ShieldAlert, Zap
} from 'lucide-react';
import { pullRequestService } from '../services/pullRequestService';
import { repositoryService } from '../services/repositoryService';
import { analysisService } from '../services/analysisService';
import { findingService } from '../services/findingService';
import { reviewService } from '../services/reviewService';
import { commitService } from '../services/commitService';
import type { PullRequestRead, RepositoryRead, AnalysisRead, FindingRead, ReviewRead, CommitRead } from '../types';
import { PROverview } from '../components/pullRequest/PROverview';
import { FindingList } from '../components/findings/FindingList';
import { CommitRow } from '../components/commit/CommitRow';
import { ReviewPreview } from '../components/review/ReviewPreview';
import { PublishModal } from '../components/review/PublishModal';
import { FilesTab } from '../components/pullRequest/FilesTab';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Card, CardContent } from '../components/common/Card';
import { cn } from '../lib/utils';
import { SecurityAssumptionPanel } from '../components/securityAssumptions/SecurityAssumptionPanel';

type TabId = 'findings' | 'files' | 'commits' | 'review' | 'assumptions';

type AnalysisPhase = 'idle' | 'triggering' | 'polling' | 'completed' | 'failed';

function getAnalysisPhaseBadge(phase: AnalysisPhase, analysis: AnalysisRead | null) {
  if (phase === 'idle') return null;
  if (phase === 'triggering' || phase === 'polling') {
    return (
      <Badge variant="info" className="gap-1.5 animate-pulse">
        <Loader2 className="w-3 h-3 animate-spin" />
        {phase === 'triggering' ? 'Triggering Analysis…' : `Analyzing (${analysis?.status || 'QUEUED'})…`}
      </Badge>
    );
  }
  if (phase === 'completed') {
    return (
      <Badge variant="success" className="gap-1.5">
        <CheckCircle className="w-3 h-3" />
        Analysis Complete
      </Badge>
    );
  }
  if (phase === 'failed') {
    return (
      <Badge variant="critical" className="gap-1.5">
        <AlertTriangle className="w-3 h-3" />
        Analysis Failed
      </Badge>
    );
  }
  return null;
}

export const PRDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const routeEvidenceAnalysisId = (location.state as { evidenceAnalysisId?: unknown } | null)?.evidenceAnalysisId;
  const evidenceAnalysisId = typeof routeEvidenceAnalysisId === 'string' ? routeEvidenceAnalysisId : null;

  // Core data
  const [pr, setPr] = useState<PullRequestRead | null>(null);
  const [repository, setRepository] = useState<RepositoryRead | null>(null);
  const [findings, setFindings] = useState<FindingRead[]>([]);
  const [review, setReview] = useState<ReviewRead | null>(null);
  const [commits, setCommits] = useState<CommitRead[]>([]);

  // Loading states
  const [prLoading, setPrLoading] = useState(true);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [commitsLoading, setCommitsLoading] = useState(false);

  // Error states
  const [prError, setPrError] = useState('');
  const [findingsError, setFindingsError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [commitsError, setCommitsError] = useState('');

  // Analysis flow
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle');
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisRead | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const pollingRef = useRef(false);

  // UI
  const [activeTab, setActiveTab] = useState<TabId>(() => evidenceAnalysisId ? 'assumptions' : 'findings');
  const [showPublishModal, setShowPublishModal] = useState(false);

  // Load findings, review after analysis or on mount
  const loadFindingsAndReview = useCallback(async (prId: string) => {
    // Findings
    setFindingsLoading(true);
    setFindingsError('');
    try {
      const res = await findingService.getFindingsForPR(prId);
      setFindings(res.items);
    } catch (err) {
      setFindingsError(err instanceof Error ? err.message : 'Failed to load findings');
    } finally {
      setFindingsLoading(false);
    }

    // Review
    setReviewLoading(true);
    setReviewError('');
    try {
      const rev = await reviewService.getReviewForPR(prId);
      setReview(rev);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No review available';
      // 404 is expected if no review has been generated yet
      if (!msg.includes('404') && !msg.toLowerCase().includes('not found')) {
        setReviewError(msg);
      } else {
        setReview(null);
      }
    } finally {
      setReviewLoading(false);
    }
  }, []);

  const loadCommits = useCallback(async (prId: string) => {
    setCommitsLoading(true);
    setCommitsError('');
    try {
      const res = await commitService.getCommitsForPR(prId);
      setCommits(res.items);
    } catch (err) {
      setCommitsError(err instanceof Error ? err.message : 'Failed to load commits');
    } finally {
      setCommitsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    const init = async () => {
      setPrLoading(true);
      setPrError('');
      try {
        const prData = await pullRequestService.getPullRequestById(id);
        if (!mounted) return;
        setPr(prData);

        // Load repo name
        repositoryService.getRepositoryById(prData.repository_id)
          .then(repo => { if (mounted) setRepository(repo); })
          .catch(() => {});

        // Load initial data
        loadFindingsAndReview(id);
        loadCommits(id);
      } catch (err) {
        if (mounted) setPrError(err instanceof Error ? err.message : 'Failed to load pull request');
      } finally {
        if (mounted) setPrLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [id, loadFindingsAndReview, loadCommits]);

  // Analyze PR handler
  const handleAnalyzePR = async () => {
    if (!id || analysisPhase === 'triggering' || analysisPhase === 'polling') return;

    setAnalysisPhase('triggering');
    setAnalysisError('');
    pollingRef.current = true;

    try {
      const analysis = await analysisService.triggerPRAnalysis(id);
      setCurrentAnalysis(analysis);
      setAnalysisPhase('polling');

      const finalAnalysis =
  await analysisService.pollAnalysisStatus(
    analysis.id,
    (polled) => {
      if (pollingRef.current) {
        setCurrentAnalysis(polled);
      }
    },
    60,
    2500,
  );

if (!pollingRef.current) return;

setCurrentAnalysis(finalAnalysis);

const finalStatus =
  finalAnalysis.status.toUpperCase();

if (finalStatus === 'COMPLETED') {
  setAnalysisPhase('completed');

  await loadFindingsAndReview(id);

  setActiveTab('findings');
} else {
  setAnalysisPhase('failed');

  setAnalysisError(
    finalAnalysis.error_message ||
      `Analysis ended with status: ${finalAnalysis.status}`,
  );
}
      // Reload findings and review after completion
      await loadFindingsAndReview(id);
      setActiveTab('findings');
    } catch (err) {
      if (!pollingRef.current) return;
      setAnalysisPhase('failed');
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { pollingRef.current = false; };
  }, []);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'findings', label: 'Findings & AI Review', icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'files', label: 'Changed Files', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'commits', label: 'Commits', icon: <GitCommit className="w-3.5 h-3.5" /> },
    { id: 'review', label: 'Review Actions', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'assumptions', label: 'Security Assumptions', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
  ];

  const isAnalyzing = analysisPhase === 'triggering' || analysisPhase === 'polling';

  if (prLoading) return <LoadingState message="Loading pull request details…" />;

  if (prError) return (
    <ErrorState
      title="Failed to load pull request"
      message={prError}
      onRetry={() => id && pullRequestService.getPullRequestById(id).then(setPr).catch(() => {})}
    />
  );

  if (!pr) return null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 flex-wrap">
        <Link to="/repositories" className="hover:text-slate-200 transition-colors flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />
          Repositories
        </Link>
        <span className="text-slate-700">/</span>
        {repository && (
          <>
            <Link
              to={`/repositories/${pr.repository_id}/pull-requests`}
              className="hover:text-slate-200 transition-colors font-mono text-xs"
            >
              {repository.full_name}
            </Link>
            <span className="text-slate-700">/</span>
          </>
        )}
        <span className="text-slate-300">PR #{pr.pr_number}</span>
      </div>

      {/* PR Overview card */}
      <Card>
        <CardContent className="p-5">
          <PROverview
            pr={pr}
            repositoryName={repository?.full_name}
            review={review}
          />
        </CardContent>
      </Card>

      {/* Analyze PR action bar */}
      <div className="flex items-center gap-3 p-4 bg-slate-900/80 border border-slate-800 rounded-xl flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Cpu className="w-4 h-4 text-indigo-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-100">Code Review Analysis</p>
            <p className="text-xs text-slate-400">
              {isAnalyzing
                ? 'VIGIL AI engine is scanning the pull request for security, logic, and quality issues…'
                : 'Run the VIGIL AI engine to generate findings and a review for this pull request.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {getAnalysisPhaseBadge(analysisPhase, currentAnalysis)}

          {analysisPhase === 'failed' && analysisError && (
            <span className="text-xs text-red-400 max-w-xs">{analysisError}</span>
          )}

          <Button
            variant="primary"
            size="md"
            loading={isAnalyzing}
            onClick={handleAnalyzePR}
            disabled={isAnalyzing}
            icon={isAnalyzing ? undefined : <Cpu className="w-4 h-4" />}
          >
            {isAnalyzing ? 'Analyzing…' :
             analysisPhase === 'completed' ? 'Re-analyze PR' : 'Analyze PR'}
          </Button>

          {(analysisPhase === 'completed' || analysisPhase === 'failed') && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => {
                setAnalysisPhase('idle');
                setCurrentAnalysis(null);
                setAnalysisError('');
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Polling progress detail */}
      {analysisPhase === 'polling' && currentAnalysis && (
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-950/30 border border-indigo-900/40 rounded-xl text-sm">
          <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
          <div>
            <span className="text-indigo-300 font-medium">Analysis in progress</span>
            <span className="text-slate-400 ml-2">
              Status: <span className="font-mono text-indigo-300">{currentAnalysis.status}</span>
              {' '}· Triggered: {currentAnalysis.trigger_type}
              {currentAnalysis.started_at && (
                <> · Started: {new Date(currentAnalysis.started_at).toLocaleTimeString()}</>
              )}
            </span>
          </div>
          <Clock className="w-4 h-4 text-slate-500 ml-auto shrink-0" />
        </div>
      )}

      {/* Tab navigation */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-0.5" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all',
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/60'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'findings' && findings.length > 0 && (
                <span className="ml-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {findings.length}
                </span>
              )}
              {tab.id === 'commits' && commits.length > 0 && (
                <span className="ml-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {commits.length}
                </span>
              )}
            </button>
          ))}

          {/* Publish button in tab bar */}
          {review && review.status !== 'PUBLISHED' && (
            <div className="ml-auto flex items-center pb-1">
              <Button
                variant="primary"
                size="sm"
                icon={<Send className="w-3.5 h-3.5" />}
                onClick={() => setShowPublishModal(true)}
              >
                Publish Review
              </Button>
            </div>
          )}
        </nav>
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {/* Findings tab */}
        {activeTab === 'findings' && (
          <div className="space-y-4">
            {findingsLoading && <LoadingState message="Loading findings…" />}
            {!findingsLoading && findingsError && (
              <ErrorState
                title="Failed to load findings"
                message={findingsError}
                onRetry={() => id && loadFindingsAndReview(id)}
              />
            )}

            {/* Prompt Injection Security Alert Banner */}
            {!findingsLoading && findings.some(f => f.category.toUpperCase() === 'PROMPT_INJECTION') && (
              <div className="flex items-start gap-3 p-4 bg-red-950/40 border border-red-700/60 rounded-xl animate-pulse-once">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-300 mb-1">
                    ⚠ Prompt Injection Attempt Detected &amp; Blocked
                  </p>
                  <p className="text-xs text-red-300/80 leading-relaxed">
                    VIGIL's security detector identified instruction-hijacking content in this repository's code,
                    comments, or PR description. This content attempted to override the AI reviewer's behavior.
                    The attempt was blocked — findings below reflect an unbiased security review.
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-mono px-2 py-1 rounded bg-red-900/50 text-red-300 border border-red-700/50 uppercase tracking-wider">
                  SECURITY DETECTOR
                </span>
              </div>
            )}

            {/* Complexity Optimization Alert Banner */}
            {!findingsLoading && findings.some(f => f.category.toUpperCase() === 'COMPLEXITY') && (
              <div className="flex items-start gap-3 p-4 bg-amber-950/40 border border-amber-700/60 rounded-xl">
                <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-300 mb-1">
                    ⚡ Code Complexity &amp; Performance Optimization Opportunity
                  </p>
                  <p className="text-xs text-amber-300/80 leading-relaxed">
                    VIGIL identified unnecessary time/space complexity introduced in this PR. Review the proposed O(n) algorithmic optimizations below to improve execution efficiency.
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-mono px-2 py-1 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50 uppercase tracking-wider">
                  COMPLEXITY ENGINE
                </span>
              </div>
            )}

            {!findingsLoading && !findingsError && findings.length === 0 && (
              <EmptyState
                icon={<Shield className="w-6 h-6" />}
                title="No findings yet"
                description={
                  analysisPhase === 'idle'
                    ? 'Click "Analyze PR" above to run the VIGIL AI engine and generate findings for this pull request.'
                    : 'No findings were returned for this pull request. This may indicate a clean review or the analysis is still in progress.'
                }
              />
            )}
            {!findingsLoading && !findingsError && findings.length > 0 && (
              <FindingList findings={findings} />
            )}

            {/* Review summary if loaded */}
            {!reviewLoading && review?.summary && (
              <div className="mt-6 p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  AI Review Summary
                </p>
                <p className="text-sm text-slate-200 leading-relaxed">{review.summary}</p>
              </div>
            )}
          </div>
        )}

        {/* Files tab */}
        {activeTab === 'files' && id && (
          <FilesTab prId={id} />
        )}

        {/* Commits tab */}
        {activeTab === 'commits' && (
          <div className="space-y-2.5">
            {commitsLoading && <LoadingState message="Loading commits…" />}
            {!commitsLoading && commitsError && (
              <ErrorState
                title="Failed to load commits"
                message={commitsError}
                onRetry={() => id && loadCommits(id)}
              />
            )}
            {!commitsLoading && !commitsError && commits.length === 0 && (
              <EmptyState
                icon={<GitCommit className="w-6 h-6" />}
                title="No commits found"
                description="No commits are registered for this pull request in the backend."
              />
            )}
            {!commitsLoading && !commitsError && commits.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-slate-500">
                    {commits.length} commit{commits.length !== 1 ? 's' : ''} · Click "Analyze Commit" on any row to run a completeness check.
                  </p>
                </div>
                {commits.map(commit => (
                  <CommitRow key={commit.id} commit={commit} />
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'assumptions' && (
          evidenceAnalysisId || currentAnalysis
            ? <SecurityAssumptionPanel analysisId={evidenceAnalysisId || currentAnalysis!.id} />
            : <EmptyState
                icon={<ShieldAlert className="w-6 h-6" />}
                title="Run an analysis first"
                description="Security assumptions are extracted and compared as part of a PR analysis. No analysis-scoped assumption data is available yet."
              />
        )}

        {/* Review Preview tab */}
        {activeTab === 'review' && (
          <div className="space-y-4">
            {reviewLoading && <LoadingState message="Loading review…" />}
            {!reviewLoading && reviewError && (
              <ErrorState
                title="Failed to load review"
                message={reviewError}
                onRetry={() => id && loadFindingsAndReview(id)}
              />
            )}
            {!reviewLoading && !reviewError && !review && (
              <EmptyState
                icon={<FileText className="w-6 h-6" />}
                title="No review generated yet"
                description='Click "Analyze PR" to run the VIGIL AI engine. A review will be generated once the analysis completes.'
              />
            )}
            {!reviewLoading && !reviewError && review && (
              <>
                <ReviewPreview review={review} />
                {review.status !== 'PUBLISHED' && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-slate-800">
                    <Button
                      variant="outline"
                      size="md"
                      className="text-slate-300 hover:text-slate-100 hover:bg-slate-800"
                      onClick={() => setShowPublishModal(true)}
                    >
                      Comment
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      className="text-red-400 hover:text-red-300 border-red-900/50 hover:bg-red-950/30 hover:border-red-800"
                      onClick={() => setShowPublishModal(true)}
                    >
                      Request Changes
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white border-none gap-2"
                      icon={<CheckCircle className="w-4 h-4" />}
                      onClick={() => setShowPublishModal(true)}
                    >
                      Approve & Publish
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {showPublishModal && review && (
        <PublishModal
          review={review}
          onClose={() => setShowPublishModal(false)}
          onPublished={(updatedReview) => {
            setReview(updatedReview);
            setShowPublishModal(false);
          }}
        />
      )}
    </div>
  );
};
