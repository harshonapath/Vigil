import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { securityAssumptionService } from '../../services/securityAssumptionService';
import type { AssumptionChangeList, AssumptionChangeRead, AssumptionEvidenceRead } from '../../types/securityAssumption';
import { LoadingState } from '../common/LoadingState';
import { ErrorState } from '../common/ErrorState';
import { EmptyState } from '../common/EmptyState';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';

interface Props { analysisId: string; }

export const SecurityAssumptionPanel: React.FC<Props> = ({ analysisId }) => {
  const [items, setItems] = useState<AssumptionChangeRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [run, setRun] = useState<AssumptionChangeList | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    securityAssumptionService.listForAnalysis(analysisId)
      .then(response => {
        if (!active) return;
        setItems(response.items);
        setRun(response);
        setError('');
      })
      .catch(err => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load security assumption changes');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [analysisId, reloadVersion]);

  const decide = async (item: AssumptionChangeRead, decision: 'APPROVE' | 'REQUEST_CHANGES' | 'ACCEPT_RISK' | 'DISMISS' | 'MARK_RESOLVED') => {
    setDecisionError('');
    try {
      await securityAssumptionService.decide(item.id, decision, item.decision_version);
      setReloadVersion(version => version + 1);
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'Decision could not be saved');
    }
  };

  if (loading) return <LoadingState message="Loading security assumptions…" />;
  if (error) return <ErrorState title="Security assumptions unavailable" message={error} onRetry={() => { setLoading(true); setReloadVersion(version => version + 1); }} />;
  if (items.length === 0) return <EmptyState icon={<ShieldAlert className="w-6 h-6" />} title={run?.extraction_status === 'UNAVAILABLE' || run?.extraction_status === 'MALFORMED_OUTPUT' ? 'Assumption extraction failed' : run?.extraction_status === 'INSUFFICIENT_EVIDENCE' ? 'Insufficient evidence' : 'No assumption changes recorded'} description={run?.extraction_status === 'COMPLETED' ? `Extraction completed with no validated changes. Context files reviewed: ${run.context_file_count}. This does not mean the repository is safe.` : `No validated changes are available for this analysis. Status: ${run?.extraction_status ?? 'not started'}. This does not mean the repository is safe.`} />;

  return <div className="space-y-4">
    {decisionError && <p role="alert" className="text-sm text-red-400">{decisionError}</p>}
    {run && <p className="text-xs text-slate-500">Extraction: {run.extraction_status ?? 'unknown'} · {run.context_file_count} context files · {run.validated_evidence_count} verified evidence excerpts{run.model ? ` · ${run.model}${run.fallback_used ? ' (fallback)' : ''}` : ''} · {run.latency_ms} ms · {run.retry_count} retries</p>}
    {items.map(item => <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={item.classification === 'CHANGED' || item.classification === 'POTENTIALLY_INVALIDATED' ? 'high' : item.classification === 'INSUFFICIENT_EVIDENCE' ? 'medium' : 'info'}>{item.classification.replaceAll('_', ' ')}</Badge>
        <Badge variant="outline">{item.review_status.replaceAll('_', ' ')}</Badge>
        <span className="text-xs text-slate-500">Confidence {(item.confidence * 100).toFixed(0)}%</span>
      </div>
      {item.prior_version && <section>
        <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Previous observation · {item.prior_version.head_sha.slice(0, 12)}</h3>
        <p className="text-sm text-slate-200">{item.prior_version.statement}</p>
        <EvidenceList evidence={item.prior_version.evidence} />
      </section>}
      {item.new_version && <section>
        <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Current observation · {item.new_version.head_sha.slice(0, 12)}</h3>
        <p className="text-sm text-slate-200">{item.new_version.statement}</p>
        <p className="text-xs text-slate-400 mt-1">{item.new_version.category} · {item.new_version.scope} · evidence {item.new_version.evidence_strength}</p>
        <EvidenceList evidence={item.new_version.evidence} />
      </section>}
      <section className="border-t border-slate-800 pt-3">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-1">Potential impact (inference)</h3>
        <p className="text-sm text-slate-300">{item.impact_summary}</p>
      </section>
      <section className="grid gap-2 border-t border-slate-800 pt-3 sm:grid-cols-2">
        <p className="text-xs text-slate-400">Risk assessment: {item.risk_level.replaceAll('_', ' ').toLowerCase()}</p>
        <p className="text-xs text-slate-400">Blast radius: {item.blast_radius_status.replaceAll('_', ' ').toLowerCase()}{item.blast_radius_items.length ? ` · ${item.blast_radius_items.join(', ')}` : ''}</p>
      </section>
      <p className="text-xs text-slate-500">Evidence strength is separate from model confidence. Reviewer actions are audit records and do not change the analysis classification.</p>
      {item.decisions.length > 0 && <section className="border-t border-slate-800 pt-3">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Review history</h3>
        <ul className="space-y-1">{item.decisions.map(decision => <li key={decision.id} className="text-xs text-slate-400">
          {decision.decision.replaceAll('_', ' ')} · {decision.reviewer_login} · {new Date(decision.created_at).toLocaleString()}{decision.comment ? ` · ${decision.comment}` : ''}
        </li>)}</ul>
      </section>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => void decide(item, 'APPROVE')}>Approve observation</Button>
        <Button size="sm" variant="outline" onClick={() => void decide(item, 'REQUEST_CHANGES')}>Request changes</Button>
        <Button size="sm" variant="outline" onClick={() => void decide(item, 'ACCEPT_RISK')}>Accept risk</Button>
        <Button size="sm" variant="ghost" onClick={() => void decide(item, 'DISMISS')}>Dismiss</Button>
        <Button size="sm" variant="ghost" onClick={() => void decide(item, 'MARK_RESOLVED')}>Mark resolved</Button>
      </div>
    </article>)}
  </div>;
};

function EvidenceList({ evidence }: { evidence: AssumptionEvidenceRead[] }) {
  if (evidence.length === 0) return <p className="mt-2 text-xs text-amber-400">Evidence is unavailable for this observation.</p>;
  return <div className="mt-2 space-y-2">{evidence.map(row => <div key={row.id} className="rounded-lg bg-slate-950/70 p-3">
    <p className="font-mono text-xs text-indigo-300">{row.path}:{row.start_line}-{row.end_line} · {row.commit_sha.slice(0, 12)} · {row.validation_status}</p>
    <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{row.excerpt}</pre>
  </div>)}</div>;
}
