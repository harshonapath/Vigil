import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, GitFork, Shield, ShieldAlert, ShieldCheck,
  GitBranch, GitPullRequest, GitCommit, Lock, Globe,
  Clock, AlertTriangle, CheckCircle2, ExternalLink, RotateCcw,
  Activity, Code2, Star, ArrowRight, Layers, Info
} from 'lucide-react';
import { repositoryService } from '../services/repositoryService';
import type { RepositoryRead } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { Button } from '../components/common/Button';
import {
  getDisplayMeta,
  getScoreColor,
  getRiskBgBorder,
  type RepoDisplayMeta,
} from '../data/repoDisplayMeta';
import { cn } from '../lib/utils';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type RepoTab = 'overview' | 'pull-requests' | 'security' | 'commits';

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const color = getScoreColor(score);
  const label = score >= 80 ? 'Good' : score >= 60 ? 'Fair' : score >= 40 ? 'Poor' : 'Critical';
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="2.5" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={score >= 80 ? 'var(--status-safe)' : score >= 60 ? 'var(--status-warn)' : score >= 40 ? 'var(--status-warn)' : 'var(--status-critical)'}
            strokeWidth="2.5"
            strokeDasharray={`${score} ${100 - score}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-black tabular-nums', color)}>{score}</span>
          <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wide">Score</span>
        </div>
      </div>
      <span className={cn('text-xs font-bold', color)}>{label}</span>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
  onClick?: () => void;
}> = ({ label, value, sub, icon, accent, onClick }) => (
  <div
    onClick={onClick}
    className={cn(
      'p-4 rounded-xl border bg-slate-900/60 border-slate-800 space-y-2',
      onClick && 'cursor-pointer hover:border-slate-700 hover:bg-slate-900 transition-all group'
    )}
  >
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">{label}</span>
      <span className="text-slate-600 group-hover:text-slate-400 transition-colors">{icon}</span>
    </div>
    <div>
      <p className={cn('text-2xl font-bold tabular-nums', accent || 'text-slate-100')}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const FindingBar: React.FC<{
  label: string;
  count: number;
  max: number;
  colorClass: string;
  barClass: string;
}> = ({ label, count, max, colorClass, barClass }) => (
  <div className="flex items-center gap-3">
    <span className="w-14 text-[11px] text-slate-400 font-medium shrink-0">{label}</span>
    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', barClass)}
        style={{ width: max > 0 ? `${(count / max) * 100}%` : '0%' }}
      />
    </div>
    <span className={cn('w-6 text-right text-sm font-bold tabular-nums', count > 0 ? colorClass : 'text-slate-600')}>
      {count}
    </span>
  </div>
);

// Realistic mock recent activity
const MOCK_COMMITS = [
  { sha: 'a4f2b9c', message: 'fix: patch SQL injection in query builder', author: 'dev-01', time: '35m ago', flag: 'security' },
  { sha: '3d8e1a0', message: 'feat: add rate limiting middleware', author: 'dev-02', time: '3h ago', flag: null },
  { sha: 'c91b4f7', message: 'refactor: extract auth token validation', author: 'dev-03', time: '6h ago', flag: null },
  { sha: '7e2d0f5', message: 'chore: update dependencies (security patch)', author: 'dev-01', time: '1d ago', flag: 'security' },
];

const MOCK_REVIEWS = [
  { pr: '#42', title: 'Add CSRF protection to all endpoints', status: 'READY', score: 61, time: '1h ago' },
  { pr: '#41', title: 'Upgrade TLS to 1.3 for internal services', status: 'PUBLISHED', score: 83, time: '3h ago' },
  { pr: '#40', title: 'Replace MD5 hashing with bcrypt', status: 'PUBLISHED', score: 91, time: '1d ago' },
];

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const RepositoryDetailPage: React.FC = () => {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const [repository, setRepository] = useState<RepositoryRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeTab, setActiveTab] = useState<RepoTab>('overview');
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!repoId) return;
    mountedRef.current = true;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const repo = await repositoryService.getRepositoryById(repoId);
        if (!mountedRef.current) return;
        setRepository(repo);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load repository');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    void run();
    return () => { mountedRef.current = false; };
  }, [repoId, refreshTick]);

  if (loading) return (
    <div className="space-y-4">
      <Link to="/repositories" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Repositories
      </Link>
      <LoadingState message="Loading repository detailsâ€¦" />
    </div>
  );

  if (error || !repository) return (
    <div className="space-y-4">
      <Link to="/repositories" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
        <ChevronLeft className="w-4 h-4" /> Repositories
      </Link>
      <ErrorState
        title="Failed to load repository"
        message={error || 'Repository not found'}
        onRetry={() => setRefreshTick(t => t + 1)}
      />
    </div>
  );

  const meta = getDisplayMeta(repository.name);
  const totalFindings = meta.criticalFindings + meta.highFindings + meta.mediumFindings + meta.lowFindings;
  const maxFindings = Math.max(meta.criticalFindings, meta.highFindings, meta.mediumFindings, meta.lowFindings, 1);

  const TABS: { key: RepoTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'pull-requests', label: 'Pull Requests', icon: <GitPullRequest className="w-3.5 h-3.5" /> },
    { key: 'security', label: 'Security', icon: <Shield className="w-3.5 h-3.5" /> },
    { key: 'commits', label: 'Commits', icon: <GitCommit className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Link to="/repositories" className="hover:text-slate-200 flex items-center gap-1 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" /> Repositories
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-500 font-mono text-xs">{repository.owner_login}</span>
        <span className="text-slate-700">/</span>
        <span className="text-slate-200 font-semibold text-sm">{repository.name}</span>
      </div>

      {/* Repository Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          {/* Repo icon */}
          <div className={cn(
            'w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 mt-0.5',
            meta.riskLevel === 'critical' ? 'bg-red-500/10 border-red-500/25 text-red-400' :
            meta.riskLevel === 'high' ? 'bg-orange-500/10 border-orange-500/25 text-orange-400' :
            'bg-indigo-500/10 border-indigo-500/25 text-indigo-400'
          )}>
            {meta.riskLevel === 'critical' || meta.riskLevel === 'high'
              ? <ShieldAlert className="w-6 h-6" />
              : <ShieldCheck className="w-6 h-6" />
            }
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 font-mono text-sm">{repository.owner_login} /</span>
              <h1 className="text-2xl font-bold text-slate-100">{repository.name}</h1>
              {repository.private ? (
                <Badge variant="outline" className="text-[10px] py-0 gap-1 border-slate-700 text-slate-400">
                  <Lock className="w-2.5 h-2.5" /> Private
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] py-0 gap-1 border-slate-700 text-slate-400">
                  <Globe className="w-2.5 h-2.5" /> Public
                </Badge>
              )}
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', getRiskBgBorder(meta.riskLevel))}>
                {meta.riskLevel === 'clean' ? <ShieldCheck className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}
                {meta.riskLevel.charAt(0).toUpperCase() + meta.riskLevel.slice(1)} Risk
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">{meta.description}</p>
            {meta.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {meta.topics.map(t => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300/80 border border-indigo-500/15 font-mono">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() => setRefreshTick(t => t + 1)}
          >
            Refresh
          </Button>
          {repository.html_url && (
            <a
              href={repository.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              <GitFork className="w-3.5 h-3.5" />
              View on GitHub
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* GitFork / Meta meta strip */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 border-b border-slate-800/80 pb-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.languageColor }} />
          <Code2 className="w-3 h-3" />
          {meta.language}
        </span>
        <span className="flex items-center gap-1.5 font-mono">
          <GitBranch className="w-3 h-3 text-slate-600" />
          {repository.default_branch}
        </span>
        <span className="flex items-center gap-1.5">
          <Star className="w-3 h-3 text-slate-600" />
          {meta.stars} stars
        </span>
        <span className="flex items-center gap-1.5 text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          GitFork read-only access
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-600" />
          Last analyzed: {meta.lastAnalyzed}
        </span>
        {repository.updated_at && (
          <span className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-slate-600" />
            Updated {new Date(repository.updated_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-800/80 -mb-2">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              if (tab.key === 'pull-requests') {
                navigate(`/repositories/${repoId}/pull-requests`);
              } else {
                setActiveTab(tab.key);
              }
            }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.key === 'pull-requests' && meta.openPRs > 0 && (
              <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {meta.openPRs}
              </span>
            )}
            {tab.key === 'security' && meta.criticalFindings > 0 && (
              <span className="bg-red-500/15 text-red-400 border border-red-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {meta.criticalFindings}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab repository={repository} meta={meta} totalFindings={totalFindings} maxFindings={maxFindings} repoId={repoId!} />
      )}
      {activeTab === 'security' && (
        <SecurityTab meta={meta} totalFindings={totalFindings} maxFindings={maxFindings} />
      )}
      {activeTab === 'commits' && (
        <CommitsTab repoId={repoId!} />
      )}
    </div>
  );
};

// â”€â”€â”€ Overview Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const OverviewTab: React.FC<{
  repository: RepositoryRead;
  meta: Omit<RepoDisplayMeta, 'id'>;
  totalFindings: number;
  maxFindings: number;
  repoId: string;
}> = ({ repository, meta, totalFindings, maxFindings, repoId }) => {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Security Score"
          value={meta.securityScore}
          sub="out of 100"
          icon={<Shield className="w-4 h-4" />}
          accent={getScoreColor(meta.securityScore)}
        />
        <StatCard
          label="Open Pull Requests"
          value={meta.openPRs}
          sub={meta.openPRs === 1 ? 'awaiting review' : 'awaiting review'}
          icon={<GitPullRequest className="w-4 h-4" />}
          accent={meta.openPRs > 0 ? 'text-indigo-400' : 'text-slate-400'}
          onClick={() => navigate(`/repositories/${repoId}/pull-requests`)}
        />
        <StatCard
          label="Total Findings"
          value={totalFindings}
          sub={`${meta.criticalFindings} critical`}
          icon={<AlertTriangle className="w-4 h-4" />}
          accent={meta.criticalFindings > 0 ? 'text-red-400' : totalFindings > 0 ? 'text-orange-400' : 'text-slate-400'}
        />
        <StatCard
          label="Last Analysis"
          value={meta.lastAnalyzed}
          sub={`on ${repository.default_branch}`}
          icon={<Clock className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Security Posture */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              Security Posture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-6">
              <ScoreGauge score={meta.securityScore} />
              <div className="flex-1 space-y-3">
                <FindingBar label="Critical" count={meta.criticalFindings} max={maxFindings} colorClass="text-red-400" barClass="bg-red-500" />
                <FindingBar label="High" count={meta.highFindings} max={maxFindings} colorClass="text-orange-400" barClass="bg-orange-500" />
                <FindingBar label="Medium" count={meta.mediumFindings} max={maxFindings} colorClass="text-amber-400" barClass="bg-amber-500" />
                <FindingBar label="Low" count={meta.lowFindings} max={maxFindings} colorClass="text-blue-400" barClass="bg-blue-500" />
              </div>
            </div>
            <div className={cn(
              'flex items-start gap-3 p-3 rounded-lg border text-xs',
              meta.riskLevel === 'critical'
                ? 'bg-red-950/20 border-red-900/30 text-red-300'
                : meta.riskLevel === 'high'
                ? 'bg-orange-950/20 border-orange-900/30 text-orange-300'
                : 'bg-slate-900/40 border-slate-800 text-slate-300'
            )}>
              {meta.riskLevel === 'critical'
                ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                : <Info className="w-4 h-4 mt-0.5 shrink-0" />
              }
              <span>
                {meta.riskLevel === 'critical'
                  ? `This repository has ${meta.criticalFindings} critical security finding${meta.criticalFindings !== 1 ? 's' : ''} that require immediate attention before any pull requests are merged.`
                  : meta.riskLevel === 'high'
                  ? `This repository has ${meta.highFindings} high-severity finding${meta.highFindings !== 1 ? 's' : ''}. Review open pull requests to ensure no new vulnerabilities are introduced.`
                  : 'Security posture is acceptable. Continue regular analysis to maintain standards.'
                }
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              Recent Reviews
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-800/60">
              {MOCK_REVIEWS.map((r, i) => (
                <div key={i} className="px-5 py-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-mono text-indigo-400">{r.pr}</span>
                      <span className={cn(
                        'text-[9px] px-1.5 py-0.5 rounded-full font-semibold border',
                        r.status === 'PUBLISHED'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                      )}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug truncate">{r.title}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{r.time}</p>
                  </div>
                  <span className={cn('text-sm font-bold tabular-nums shrink-0', getScoreColor(r.score))}>
                    {r.score}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent commits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-slate-400" />
              Recent Commits
            </span>
            <span className="text-[10px] font-mono text-slate-500">{repository.default_branch}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-800/60">
            {MOCK_COMMITS.map((c, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4">
                <code className="text-[11px] font-mono text-indigo-400 w-14 shrink-0">{c.sha}</code>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-200 truncate">{c.message}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{c.author} Â· {c.time}</p>
                </div>
                {c.flag === 'security' && (
                  <Badge variant="high" className="text-[9px] py-0 shrink-0">Security</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Navigation CTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NavCTA
          to={`/repositories/${repoId}/pull-requests`}
          icon={<GitPullRequest className="w-4 h-4" />}
          label="Pull Requests"
          description={`${meta.openPRs} open Â· pending AI review`}
        />
        <NavCTA
          onClick={() => {}}
          icon={<Shield className="w-4 h-4" />}
          label="Security Findings"
          description={`${totalFindings} findings Â· ${meta.criticalFindings} critical`}
          critical={meta.criticalFindings > 0}
        />
        <NavCTA
          onClick={() => {}}
          icon={<GitCommit className="w-4 h-4" />}
          label="Commit Analysis"
          description="Review commit-level security"
        />
      </div>
    </div>
  );
};

// â”€â”€â”€ Security Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SecurityTab: React.FC<{
  meta: Omit<RepoDisplayMeta, 'id'>;
  totalFindings: number;
  maxFindings: number;
}> = ({ meta, totalFindings, maxFindings }) => (
  <div className="space-y-5">
    {/* Risk summary */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400" />
          Security Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-start gap-8">
          <ScoreGauge score={meta.securityScore} />
          <div className="flex-1 space-y-3 pt-1">
            <FindingBar label="Critical" count={meta.criticalFindings} max={maxFindings} colorClass="text-red-400" barClass="bg-red-500" />
            <FindingBar label="High" count={meta.highFindings} max={maxFindings} colorClass="text-orange-400" barClass="bg-orange-500" />
            <FindingBar label="Medium" count={meta.mediumFindings} max={maxFindings} colorClass="text-amber-400" barClass="bg-amber-500" />
            <FindingBar label="Low" count={meta.lowFindings} max={maxFindings} colorClass="text-blue-400" barClass="bg-blue-500" />
            <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-500">Total findings</span>
              <span className="font-bold text-slate-300 tabular-nums">{totalFindings}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Coming in Stage 8 notice */}
    <div className="flex items-start gap-3 p-4 bg-indigo-950/20 border border-indigo-900/30 rounded-xl text-sm text-indigo-300">
      <Info className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-indigo-200 mb-1">Full Security Findings â€” Stage 8</p>
        <p className="text-[12px] text-indigo-300/70">
          Detailed security findings with AI explanations, remediation guidance, and CWE/OWASP
          categorization will be implemented in Stage 8 of the VIGIL development roadmap.
        </p>
      </div>
    </div>
  </div>
);

// â”€â”€â”€ Commits Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const CommitsTab: React.FC<{ repoId: string }> = () => (
  <div className="space-y-5">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-slate-400" />
          Recent Commits
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-800/60">
          {MOCK_COMMITS.map((c, i) => (
            <div key={i} className="px-5 py-3.5 flex items-center gap-4">
              <code className="text-[11px] font-mono text-indigo-400 w-14 shrink-0">{c.sha}</code>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200">{c.message}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{c.author} Â· {c.time}</p>
              </div>
              {c.flag === 'security' && (
                <Badge variant="high" className="text-[9px] py-0 shrink-0">Security</Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    <div className="flex items-start gap-3 p-4 bg-indigo-950/20 border border-indigo-900/30 rounded-xl text-sm text-indigo-300">
      <Info className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-indigo-200 mb-1">Full Commit Analysis â€” Stage 9</p>
        <p className="text-[12px] text-indigo-300/70">
          Per-commit security analysis, diff scanning, and AI-generated commit review will be
          implemented in Stage 9 via the <code className="font-mono">/api/v1/commits/&#123;sha&#125;/analyze</code> endpoint.
        </p>
      </div>
    </div>
  </div>
);

// â”€â”€â”€ Nav CTA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NavCTA: React.FC<{
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  critical?: boolean;
}> = ({ to, onClick, icon, label, description, critical }) => {
  const cls = cn(
    'flex items-center justify-between p-4 rounded-xl border transition-all group cursor-pointer w-full text-left',
    critical
      ? 'bg-red-950/10 border-red-900/25 hover:border-red-800/50'
      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
  );
  const inner = (
    <>
      <div className="flex items-center gap-3">
        <span className={cn('text-slate-400', critical && 'text-red-400')}>{icon}</span>
        <div>
          <p className="text-sm font-semibold text-slate-200">{label}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
    </>
  );

  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
};


