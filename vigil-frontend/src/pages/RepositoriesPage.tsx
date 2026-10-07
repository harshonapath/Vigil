import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Layers, RotateCcw, GitFork, Shield, ShieldAlert,
  Filter, SortAsc, CheckCircle2, Lock, Globe,
  ChevronDown, X
} from 'lucide-react';

import { repositoryService } from '../services/repositoryService';
import type { RepositoryRead } from '../types';
import { RepositoryCard } from '../components/repository/RepositoryCard';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { getDisplayMeta } from '../data/repoDisplayMeta';
import { useGitHub } from '../contexts/GitHubContext';
import { cn } from '../lib/utils';

// â”€â”€â”€ GitFork Connection Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GitHubConnectionBanner: React.FC<{
  connected: boolean;
  onManage: () => void;
}> = ({ connected, onManage }) => {
  if (connected) {
    return (
      <div className="flex items-center justify-between gap-4 p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-xl flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <GitFork className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">GitHub App Connected</span>
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Synchronized
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Vigil is monitoring your authorized GitHub repositories and pull requests for security risks.
            </p>
          </div>
        </div>
        <button
          onClick={onManage}
          className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          Manage
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 p-4 bg-slate-900/80 border border-slate-700/60 rounded-xl flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
          <GitFork className="w-4 h-4 text-slate-400" />
        </div>
        <div>
          <span className="text-sm font-semibold text-slate-200">Connect GitHub</span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Connect your GitHub App installation to enable repository synchronization and PR review.
          </p>
        </div>
      </div>
      <button onClick={onManage} className="text-xs font-semibold bg-indigo-600/90 hover:bg-indigo-600 text-white px-4 py-1.5 rounded-lg transition-colors flex items-center gap-2 shrink-0">
        <GitFork className="w-3.5 h-3.5" />
        Connect GitHub
      </button>
    </div>
  );
};


// â”€â”€â”€ Sort / Filter types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SortKey = 'name' | 'risk' | 'score' | 'prs' | 'updated';
type FilterRisk = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'clean';
type FilterVis = 'all' | 'private' | 'public';

const RISK_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, clean: 4,
};

// â”€â”€â”€ Main Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const RepositoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const [repositories, setRepositories] = useState<RepositoryRead[]>([]);

  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const { connected: githubConnected, installationId } = useGitHub();
  const [sortKey, setSortKey] = useState<SortKey>('risk');
  const [filterRisk, setFilterRisk] = useState<FilterRisk>('all');
  const [filterVis, setFilterVis] = useState<FilterVis>('all');
  const [showFilters, setShowFilters] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await repositoryService.getMyRepositories(1, 50, installationId);
        if (!mountedRef.current) return;
        setRepositories(res.items);
        setTotal(res.total);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load repositories');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    void run();
    return () => { mountedRef.current = false; };
  }, [refreshTick, installationId]);


  const handleRefresh = () => setRefreshTick(t => t + 1);

  // Filter + sort pipeline
  const processed = repositories
    .filter(r => {
      const meta = getDisplayMeta(r.name);
      const q = searchQuery.toLowerCase();
      const matchSearch =
        q === '' ||
        r.full_name.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.owner_login.toLowerCase().includes(q) ||
        meta.language.toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q);
      const matchRisk = filterRisk === 'all' || meta.riskLevel === filterRisk;
      const matchVis =
        filterVis === 'all' ||
        (filterVis === 'private' && r.private) ||
        (filterVis === 'public' && !r.private);
      return matchSearch && matchRisk && matchVis;
    })
    .sort((a, b) => {
      const ma = getDisplayMeta(a.name);
      const mb = getDisplayMeta(b.name);
      switch (sortKey) {
        case 'name': return a.name.localeCompare(b.name);
        case 'risk': return (RISK_ORDER[ma.riskLevel] ?? 9) - (RISK_ORDER[mb.riskLevel] ?? 9);
        case 'score': return ma.securityScore - mb.securityScore;
        case 'prs': return mb.openPRs - ma.openPRs;
        case 'updated': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        default: return 0;
      }
    });

  const hasActiveFilters = filterRisk !== 'all' || filterVis !== 'all' || searchQuery !== '';

  // Summary counts
  const critical = repositories.filter(r => getDisplayMeta(r.name).riskLevel === 'critical').length;
  const high = repositories.filter(r => getDisplayMeta(r.name).riskLevel === 'high').length;
  const clean = repositories.filter(r => ['clean', 'low'].includes(getDisplayMeta(r.name).riskLevel)).length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-slate-400" />
            <h1 className="text-xl font-bold text-slate-100">Repositories</h1>
          </div>
          <p className="text-sm text-slate-400">
            SecurePR-monitored repositories. Click any repository to view its security posture.
            {!loading && total > 0 && (
              <span className="ml-1 text-slate-500">({total} connected)</span>
            )}
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

      {/* GitFork connection banner */}
      <GitHubConnectionBanner
        connected={githubConnected}
        onManage={() => navigate('/connect')}
      />


      {/* Summary strip */}
      {!loading && !error && repositories.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <SummaryChip
            icon={<ShieldAlert className="w-4 h-4 text-red-400" />}
            label="Critical Risk"
            value={critical}
            colorClass="text-red-400"
            active={filterRisk === 'critical'}
            onClick={() => setFilterRisk(f => f === 'critical' ? 'all' : 'critical')}
          />
          <SummaryChip
            icon={<ShieldAlert className="w-4 h-4 text-orange-400" />}
            label="High Risk"
            value={high}
            colorClass="text-orange-400"
            active={filterRisk === 'high'}
            onClick={() => setFilterRisk(f => f === 'high' ? 'all' : 'high')}
          />
          <SummaryChip
            icon={<Shield className="w-4 h-4 text-emerald-400" />}
            label="Low / Clean"
            value={clean}
            colorClass="text-emerald-400"
            active={filterRisk === 'low' || filterRisk === 'clean'}
            onClick={() => setFilterRisk(f => f === 'low' ? 'all' : 'low')}
          />
        </div>
      )}

      {/* Search + filter bar */}
      {!loading && !error && repositories.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, owner, languageâ€¦"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 text-sm text-slate-200 rounded-lg placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(f => !f)}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                showFilters || (filterRisk !== 'all' || filterVis !== 'all')
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {(filterRisk !== 'all' || filterVis !== 'all') && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              )}
            </button>

            {/* Sort */}
            <SortDropdown value={sortKey} onChange={setSortKey} />
          </div>

          {/* Expanded filter panel */}
          {showFilters && (
            <div className="flex flex-wrap gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
              {/* Risk filter */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Risk Level</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'critical', 'high', 'medium', 'low', 'clean'] as FilterRisk[]).map(r => (
                    <FilterChip
                      key={r}
                      label={r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                      active={filterRisk === r}
                      onClick={() => setFilterRisk(r)}
                    />
                  ))}
                </div>
              </div>
              {/* Visibility filter */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Visibility</p>
                <div className="flex gap-1.5">
                  {([
                    { key: 'all', label: 'All', Icon: Layers },
                    { key: 'private', label: 'Private', Icon: Lock },
                    { key: 'public', label: 'Public', Icon: Globe },
                  ] as { key: FilterVis; label: string; Icon: React.FC<{ className?: string }> }[]).map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      onClick={() => setFilterVis(key)}
                      className={cn(
                        'flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md border transition-colors font-medium',
                        filterVis === key
                          ? 'bg-slate-700 text-slate-200 border-slate-600'
                          : 'bg-transparent text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                      )}
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={() => { setFilterRisk('all'); setFilterVis('all'); setSearchQuery(''); }}
                  className="self-end text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1 ml-auto"
                >
                  <X className="w-3 h-3" />
                  Clear all
                </button>
              )}
            </div>
          )}

          {/* Result count */}
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>{processed.length} of {repositories.length} repositories</span>
            {hasActiveFilters && (
              <button
                onClick={() => { setFilterRisk('all'); setFilterVis('all'); setSearchQuery(''); }}
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* States */}
      {loading && <LoadingState message="Fetching connected repositories from SecurePR backendâ€¦" />}

      {!loading && error && (
        <ErrorState title="Failed to load repositories" message={error} onRetry={handleRefresh} />
      )}

      {!loading && !error && repositories.length === 0 && (
        <EmptyState
          icon={<Layers className="w-6 h-6" />}
          title="No repositories connected"
          description="No repositories are registered in the Vigil backend. Connect your GitHub App installation to begin security analysis."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate('/connect')}>
              Connect GitHub
            </Button>
          }
        />
      )}


      {!loading && !error && processed.length === 0 && repositories.length > 0 && (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title="No repositories match your filters"
          description="Try clearing your search or adjusting the risk / visibility filters."
          action={
            <Button variant="ghost" size="sm" onClick={() => { setFilterRisk('all'); setFilterVis('all'); setSearchQuery(''); }}>
              Clear all filters
            </Button>
          }
        />
      )}

      {!loading && !error && processed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {processed.map(repo => (
            <RepositoryCard key={repo.id} repository={repo} />
          ))}
        </div>
      )}
    </div>
  );
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SummaryChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  colorClass: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ icon, label, value, colorClass, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center justify-between p-3 rounded-xl border transition-all text-left w-full',
      active
        ? 'bg-slate-800 border-slate-700 ring-1 ring-slate-600'
        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
    )}
  >
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-slate-400 font-medium">{label}</span>
    </div>
    <span className={cn('text-xl font-bold tabular-nums', colorClass)}>{value}</span>
  </button>
);

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'text-[11px] px-2.5 py-1 rounded-md border transition-colors font-medium',
      active
        ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
        : 'bg-transparent text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700'
    )}
  >
    {label}
  </button>
);

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'risk', label: 'Risk Level' },
  { key: 'score', label: 'Security Score' },
  { key: 'prs', label: 'Open PRs' },
  { key: 'name', label: 'Name Aâ€“Z' },
  { key: 'updated', label: 'Last Updated' },
];

const SortDropdown: React.FC<{ value: SortKey; onChange: (k: SortKey) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = SORT_OPTIONS.find(o => o.key === value);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-800 bg-slate-900 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-colors"
      >
        <SortAsc className="w-3.5 h-3.5" />
        {current?.label}
        <ChevronDown className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/40 overflow-hidden py-1">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false); }}
              className={cn(
                'w-full text-left text-xs px-3 py-2 transition-colors',
                value === opt.key
                  ? 'text-indigo-400 bg-indigo-500/10'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

