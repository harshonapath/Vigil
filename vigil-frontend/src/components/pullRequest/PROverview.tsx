import React from 'react';
import { GitBranch, User, GitCommit, Hash, Calendar, Circle, FileCode, Plus, Minus } from 'lucide-react';
import type { PullRequestRead } from '../../types';
import type { ReviewRead } from '../../types';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import { getPRDisplayMeta } from '../../data/prDisplayMeta';

interface PROverviewProps {
  pr: PullRequestRead;
  repositoryName?: string;
  review?: ReviewRead | null;
}

function getReviewStatusVariant(status: string): 'success' | 'info' | 'medium' | 'critical' | 'secondary' | 'outline' {
  switch (status.toUpperCase()) {
    case 'PUBLISHED': return 'success';
    case 'READY': return 'info';
    case 'DRAFT': return 'secondary';
    case 'PUBLISH_FAILED': return 'critical';
    default: return 'outline';
  }
}

function getPRStatusVariant(status: string): 'success' | 'info' | 'secondary' | 'outline' {
  switch (status.toUpperCase()) {
    case 'OPEN': return 'success';
    case 'MERGED': return 'info';
    case 'CLOSED': return 'secondary';
    default: return 'outline';
  }
}

export const PROverview: React.FC<PROverviewProps> = ({ pr, repositoryName, review }) => {
  const meta = getPRDisplayMeta(pr.id);

  return (
    <div className="space-y-4">
      {/* PR Title */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="text-xs font-mono text-slate-500">#{pr.pr_number}</span>
          <Badge variant={getPRStatusVariant(pr.status)} className="gap-1 uppercase">
            <Circle className="w-1.5 h-1.5 fill-current" />
            {pr.status}
          </Badge>
          {review && (
            <Badge variant={getReviewStatusVariant(review.status)} className="gap-1">
              Review: {review.status}
            </Badge>
          )}
          <div className="flex items-center gap-2 ml-auto text-xs font-medium">
            <span className="flex items-center gap-1 text-slate-400">
              <FileCode className="w-3.5 h-3.5" />
              {meta.files_changed} files
            </span>
            {meta.additions > 0 || meta.deletions > 0 ? (
              <>
                <span className="flex items-center text-emerald-400">
                  <Plus className="w-3.5 h-3.5" />
                  {meta.additions}
                </span>
                <span className="flex items-center text-red-400">
                  <Minus className="w-3.5 h-3.5" />
                  {meta.deletions}
                </span>
              </>
            ) : (
              <span className="text-slate-500 italic text-[11px]">Diff stats unavailable</span>
            )}
          </div>
        </div>
        <h1 className="text-xl font-bold text-slate-100 leading-snug">{pr.title}</h1>
        {pr.description && (
          <p className="mt-2 text-sm text-slate-400 leading-relaxed line-clamp-2">{pr.description}</p>
        )}
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetaItem
          icon={<User className="w-3.5 h-3.5" />}
          label="Author"
          value={pr.author_login}
        />
        {repositoryName && (
          <MetaItem
            icon={<GitBranch className="w-3.5 h-3.5" />}
            label="Repository"
            value={repositoryName}
          />
        )}
        <MetaItem
          icon={<GitBranch className="w-3.5 h-3.5" />}
          label="Source Branch"
          value={pr.source_branch}
          mono
        />
        <MetaItem
          icon={<GitBranch className="w-3.5 h-3.5" />}
          label="Target Branch"
          value={pr.target_branch}
          mono
        />
        <MetaItem
          icon={<Hash className="w-3.5 h-3.5" />}
          label="Head SHA"
          value={pr.head_sha.slice(0, 12) + '...'}
          mono
        />
        <MetaItem
          icon={<GitCommit className="w-3.5 h-3.5" />}
          label="Base SHA"
          value={pr.base_sha.slice(0, 12) + '...'}
          mono
        />
        <MetaItem
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Opened"
          value={new Date(pr.created_at).toLocaleDateString()}
        />
        <MetaItem
          icon={<Calendar className="w-3.5 h-3.5" />}
          label="Last Updated"
          value={new Date(pr.updated_at).toLocaleDateString()}
        />
      </div>
    </div>
  );
};

const MetaItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}> = ({ icon, label, value, mono }) => (
  <div className="flex flex-col gap-1 p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 uppercase tracking-wider font-medium">
      <span className={cn('text-slate-500')}>{icon}</span>
      {label}
    </div>
    <span className={cn('text-xs text-slate-200 truncate', mono && 'font-mono')}>{value}</span>
  </div>
);
