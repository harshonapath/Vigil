import React from 'react';
import { FileCode, Plus, Minus, ChevronRight, ChevronDown } from 'lucide-react';
import { getPRDisplayMeta, type ChangedFile } from '../../data/prDisplayMeta';
import { Card } from '../common/Card';
import { cn } from '../../lib/utils';

interface FilesTabProps {
  prId: string;
}

export const FilesTab: React.FC<FilesTabProps> = ({ prId }) => {
  const meta = getPRDisplayMeta(prId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-3 bg-slate-900/60 border border-slate-800 rounded-lg">
        <span className="text-sm font-medium text-slate-200">
          Changed Files ({meta.files_changed})
        </span>
        <div className="flex items-center gap-3 text-xs font-medium ml-auto">
          <span className="flex items-center text-emerald-400">
            <Plus className="w-3.5 h-3.5 mr-0.5" />
            {meta.additions} additions
          </span>
          <span className="flex items-center text-red-400">
            <Minus className="w-3.5 h-3.5 mr-0.5" />
            {meta.deletions} deletions
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {meta.files.map((file, idx) => (
          <FileDiffCard key={idx} file={file} />
        ))}
      </div>
    </div>
  );
};

const FileDiffCard: React.FC<{ file: ChangedFile }> = ({ file }) => {
  const [expanded, setExpanded] = React.useState(true);

  return (
    <Card className="overflow-hidden border-slate-800">
      {/* File Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-slate-900 hover:bg-slate-800/80 transition-colors border-b border-slate-800"
      >
        <div className="flex items-center gap-2 text-sm text-slate-300 font-mono">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
          <FileCode className="w-4 h-4 text-slate-400" />
          <span className="break-all text-left">{file.filename}</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono ml-4 shrink-0">
          <span className="text-emerald-400">+{file.additions}</span>
          <span className="text-red-400">-{file.deletions}</span>
        </div>
      </button>

      {/* Diff Content */}
      {expanded && (
        <div className="overflow-x-auto bg-[var(--card)] text-[12px] font-mono leading-relaxed">
          <pre className="p-4 w-full inline-block min-w-max">
            {file.patch.split('\\n').map((line, i) => {
              const isAddition = line.startsWith('+');
              const isDeletion = line.startsWith('-');
              const isMeta = line.startsWith('@@');

              return (
                <div
                  key={i}
                  className={cn(
                    'px-4 py-0.5 -mx-4',
                    isAddition && 'bg-emerald-500/10 text-emerald-300',
                    isDeletion && 'bg-red-500/10 text-red-300',
                    isMeta && 'text-indigo-400',
                    !isAddition && !isDeletion && !isMeta && 'text-slate-400'
                  )}
                >
                  <span className="inline-block w-6 text-slate-600 select-none opacity-50 mr-2">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </Card>
  );
};
