import React, { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, FileCode, AlertTriangle, Lightbulb, Search, Tag, ShieldAlert, Zap, TriangleAlert, LockKeyhole } from 'lucide-react';
import type { FindingRead } from '../../types';
import { Card, CardContent } from '../common/Card';
import { Badge } from '../common/Badge';
import { SeverityBadge } from './SeverityBadge';
import { cn } from '../../lib/utils';

interface FindingCardProps {
  finding: FindingRead;
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    SECURITY: 'Security',
    PROMPT_INJECTION: 'Prompt Injection',
    COMPLEXITY: 'Complexity',
    EDGE_CASE: 'Edge Case',
    SECURITY_ASSUMPTION: 'Security Assumption',
    LOGIC: 'Logic',
    ERROR_HANDLING: 'Error Handling',
    TESTING: 'Testing',
    MAINTAINABILITY: 'Maintainability',
    CODE_QUALITY: 'Code Quality',
    DOCUMENTATION: 'Documentation',
    PERFORMANCE: 'Performance',
  };
  return labels[category.toUpperCase()] || category;
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    SEMGREP: 'Semgrep',
    GITLEAKS: 'Gitleaks',
    TRIVY: 'Trivy',
    MS_SECURITY_DEVOPS: 'MS Security DevOps',
    AI_REVIEW: 'SecurePR AI',
    SECURITY_DETECTOR: 'Security Detector',
    COMPLEXITY_ANALYZER: 'Complexity Analyzer',
    EDGE_CASE_ANALYZER: 'Edge Case Analyzer',
    SECURITY_ASSUMPTION_ANALYZER: 'Security Assumption Analyzer',
  };
  return labels[source.toUpperCase()] || source;
}


function getStatusVariant(status: string): 'outline' | 'critical' | 'success' | 'secondary' {
  switch (status.toUpperCase()) {
    case 'OPEN': return 'critical';
    case 'RESOLVED': return 'success';
    case 'ACKNOWLEDGED': return 'outline';
    case 'FALSE_POSITIVE': return 'secondary';
    default: return 'outline';
  }
}

export const FindingCard: React.FC<FindingCardProps> = ({ finding }) => {
  const [expanded, setExpanded] = useState(false);
  const evidence = finding.evidence;
  const isInjectionFinding = finding.category.toUpperCase() === 'PROMPT_INJECTION';
  const isComplexityFinding = finding.category.toUpperCase() === 'COMPLEXITY';
  const isEdgeCaseFinding = finding.category.toUpperCase() === 'EDGE_CASE';
  const isAssumptionFinding = finding.category.toUpperCase() === 'SECURITY_ASSUMPTION';

  const currentTimeComp = evidence?.current_time_complexity as string | undefined;
  const suggestedTimeComp = evidence?.suggested_time_complexity as string | undefined;
  const currentSpaceComp = evidence?.current_space_complexity as string | undefined;
  const suggestedSpaceComp = evidence?.suggested_space_complexity as string | undefined;

  const edgeCaseType = evidence?.edge_case_type as string | undefined;
  const edgeScenario = evidence?.scenario as string | undefined;
  const edgeExpected = evidence?.expected_behavior as string | undefined;
  const edgeCurrent = evidence?.current_behavior as string | undefined;
  const edgeImpact = evidence?.potential_impact as string | undefined;

  const assumptionName = evidence?.assumption_name as string | undefined;
  const assumptionScope = evidence?.scope as string | undefined;
  const prevAssumption = evidence?.previous_assumption as string | undefined;
  const newAssumption = evidence?.new_assumption as string | undefined;
  const changeType = evidence?.change_type as string | undefined;
  const potentialRepercussions = evidence?.potential_repercussions as string | undefined;

  return (
    <Card className={cn(
      'transition-all',
      isInjectionFinding && 'border-red-600/60 bg-red-950/10',
      isComplexityFinding && 'border-amber-600/50 bg-amber-950/10',
      isEdgeCaseFinding && 'border-cyan-600/50 bg-cyan-950/10',
      isAssumptionFinding && 'border-purple-600/50 bg-purple-950/10',
      !isInjectionFinding && !isComplexityFinding && !isEdgeCaseFinding && !isAssumptionFinding && finding.severity.toUpperCase() === 'CRITICAL' && 'border-red-900/40',
      !isInjectionFinding && !isComplexityFinding && !isEdgeCaseFinding && !isAssumptionFinding && finding.severity.toUpperCase() === 'HIGH' && 'border-orange-900/30',
    )}>
      {/* Injection threat strip */}
      {isInjectionFinding && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-950/60 border-b border-red-700/50 rounded-t-xl">
          <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="text-[11px] font-semibold text-red-300 uppercase tracking-wider">
            Prompt Injection — AI Manipulation Attempt Blocked
          </span>
        </div>
      )}

      {/* Complexity strip */}
      {isComplexityFinding && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-950/60 border-b border-amber-700/50 rounded-t-xl">
          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
            Complexity Issue — Algorithmic Optimization Opportunity
          </span>
        </div>
      )}

      {/* Edge Case strip */}
      {isEdgeCaseFinding && (
        <div className="flex items-center gap-2 px-4 py-2 bg-cyan-950/60 border-b border-cyan-700/50 rounded-t-xl">
          <TriangleAlert className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wider">
            Edge Case — Unhandled Failure Scenario Detected
          </span>
          {edgeCaseType && (
            <Badge variant="outline" className="text-[10px] py-0 border-cyan-700/60 text-cyan-300 ml-auto">
              {edgeCaseType}
            </Badge>
          )}
        </div>
      )}

      {/* Security Assumption strip */}
      {isAssumptionFinding && (
        <div className="flex items-center gap-2 px-4 py-2 bg-purple-950/60 border-b border-purple-700/50 rounded-t-xl">
          <LockKeyhole className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider">
            Security Assumption Changed — Consistency Regression
          </span>
          {changeType && (
            <Badge variant="outline" className="text-[10px] py-0 border-purple-700/60 text-purple-300 font-mono ml-auto">
              {changeType}
            </Badge>
          )}
        </div>
      )}

      {/* Header — always visible */}
      <button
        className="w-full text-left p-4 flex items-start gap-3 group hover:bg-slate-800/20 transition-colors rounded-t-xl"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="mt-0.5 shrink-0">
          <SeverityBadge severity={finding.severity} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-100 leading-snug pr-2 text-left">{finding.message}</p>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <Badge variant="outline" className="text-[10px] py-0">
                {getCategoryLabel(finding.category)}
              </Badge>
              <Badge variant={getStatusVariant(finding.status)} className="text-[10px] py-0 uppercase">
                {finding.status}
              </Badge>
              {expanded
                ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              }
            </div>
          </div>

          {/* Location line — always visible */}
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {finding.file_path && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <FileCode className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate max-w-xs">{finding.file_path}</span>
                {finding.start_line !== null && (
                  <span className="flex items-center gap-0.5 text-slate-500">
                    <MapPin className="w-3 h-3" />
                    L{finding.start_line}
                    {finding.end_line && finding.end_line !== finding.start_line && `–${finding.end_line}`}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Tag className="w-3 h-3" />
              <span>{getSourceLabel(finding.source)}</span>
            </div>
            {finding.rule_id && (
              <span className="text-xs font-mono text-slate-500">{finding.rule_id}</span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <CardContent className="pt-0 border-t border-slate-800/60">
          <div className="space-y-3 pt-3">
            {/* Complexity comparison box if metrics present */}
            {(currentTimeComp || suggestedTimeComp || currentSpaceComp || suggestedSpaceComp) && (
              <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Algorithmic Complexity Metrics</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs font-mono">
                  {(currentTimeComp || suggestedTimeComp) && (
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Time Complexity:</span>
                      <div className="flex items-center gap-1.5">
                        {currentTimeComp && (
                          <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800/60 font-semibold">
                            {currentTimeComp}
                          </span>
                        )}
                        {currentTimeComp && suggestedTimeComp && <span className="text-slate-500">→</span>}
                        {suggestedTimeComp && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold">
                            {suggestedTimeComp}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {(currentSpaceComp || suggestedSpaceComp) && (
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400">Space Complexity:</span>
                      <div className="flex items-center gap-1.5">
                        {currentSpaceComp && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold">
                            {currentSpaceComp}
                          </span>
                        )}
                        {currentSpaceComp && suggestedSpaceComp && <span className="text-slate-500">→</span>}
                        {suggestedSpaceComp && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold">
                            {suggestedSpaceComp}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Edge Case Scenario Box */}
            {isEdgeCaseFinding && (edgeScenario || edgeExpected || edgeCurrent || edgeImpact) && (
              <div className="p-3 bg-cyan-950/20 border border-cyan-800/40 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
                  <TriangleAlert className="w-3.5 h-3.5" />
                  <span>Edge Case Scenario Analysis</span>
                </div>
                <div className="grid grid-cols-1 gap-2 pt-1 text-xs">
                  {edgeScenario && (
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                      <span className="text-slate-400 font-semibold">Trigger Scenario: </span>
                      <span className="text-slate-200">{edgeScenario}</span>
                    </div>
                  )}
                  {edgeCurrent && (
                    <div className="p-2 bg-red-950/30 rounded border border-red-900/40">
                      <span className="text-red-400 font-semibold">Current Behavior: </span>
                      <span className="text-red-200">{edgeCurrent}</span>
                    </div>
                  )}
                  {edgeExpected && (
                    <div className="p-2 bg-emerald-950/30 rounded border border-emerald-900/40">
                      <span className="text-emerald-400 font-semibold">Expected Behavior: </span>
                      <span className="text-emerald-200">{edgeExpected}</span>
                    </div>
                  )}
                  {edgeImpact && (
                    <div className="p-2 bg-amber-950/30 rounded border border-amber-900/40">
                      <span className="text-amber-400 font-semibold">Potential Impact: </span>
                      <span className="text-amber-200">{edgeImpact}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Security Assumption Change Box */}
            {isAssumptionFinding && (prevAssumption || newAssumption || changeType || potentialRepercussions || assumptionName) && (
              <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-purple-400 font-semibold text-xs uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <LockKeyhole className="w-3.5 h-3.5" />
                    <span>Security Assumption Change Analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {assumptionName && (
                      <span className="text-[10px] font-mono text-purple-300 font-medium">
                        {assumptionName}
                      </span>
                    )}
                    {assumptionScope && (
                      <span className="text-[10px] font-mono text-purple-300/80 lowercase">
                        scope: {assumptionScope}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 pt-1 text-xs">
                  {prevAssumption && (
                    <div className="p-2 bg-slate-900/80 rounded border border-slate-800">
                      <span className="text-slate-400 font-semibold">Previous Assumption: </span>
                      <span className="text-slate-200">{prevAssumption}</span>
                    </div>
                  )}
                  {newAssumption && (
                    <div className="p-2 bg-purple-950/30 rounded border border-purple-900/40">
                      <span className="text-purple-300 font-semibold">Current / Changed Behavior: </span>
                      <span className="text-slate-200">{newAssumption}</span>
                    </div>
                  )}
                  {potentialRepercussions && (
                    <div className="p-2 bg-red-950/30 rounded border border-red-900/40">
                      <span className="text-red-400 font-semibold">Potential Repercussions: </span>
                      <span className="text-red-200">{potentialRepercussions}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Problem */}
            {evidence?.problem && (
              <EvidenceSection
                icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                label="Problem"
                content={evidence.problem}
              />
            )}

            {/* Why it matters */}
            {evidence?.why && (
              <EvidenceSection
                icon={<Search className="w-3.5 h-3.5 text-indigo-400" />}
                label="Why It Matters"
                content={evidence.why}
              />
            )}

            {/* Evidence / Code snippet */}
            {(evidence?.evidence || evidence?.code_snippet) && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-1.5">Evidence</p>
                <pre className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {evidence.evidence || evidence.code_snippet}
                </pre>
              </div>
            )}

            {/* Suggestion */}
            {evidence?.suggestion && (
              <EvidenceSection
                icon={<Lightbulb className="w-3.5 h-3.5 text-emerald-400" />}
                label="Suggestion"
                content={evidence.suggestion}
                highlight
              />
            )}

            {/* Description fallback */}
            {evidence?.description && !evidence?.problem && (
              <EvidenceSection
                icon={<AlertTriangle className="w-3.5 h-3.5 text-slate-400" />}
                label="Description"
                content={evidence.description}
              />
            )}

            {/* Raw finding message if no evidence breakdown available */}
            {!evidence && (
              <div className="p-3 bg-slate-950/60 border border-slate-800/60 rounded-lg">
                <p className="text-xs text-slate-300 leading-relaxed">{finding.message}</p>
              </div>
            )}

            {/* Fingerprint */}
            <div className="pt-1 flex items-center gap-2 text-[10px] text-slate-600 font-mono border-t border-slate-800/60">
              <span>fingerprint: {finding.fingerprint}</span>
              {finding.raw_artifact_uri && (
                <a
                  href={finding.raw_artifact_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-500 hover:underline"
                >
                  View raw artifact
                </a>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};

const EvidenceSection: React.FC<{
  icon: React.ReactNode;
  label: string;
  content: string;
  highlight?: boolean;
}> = ({ icon, label, content, highlight }) => (
  <div className={cn(
    'p-3 rounded-lg border text-xs leading-relaxed',
    highlight
      ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-200'
      : 'bg-slate-950/40 border-slate-800/60 text-slate-300'
  )}>
    <div className="flex items-center gap-1.5 mb-1.5">
      {icon}
      <span className="text-[11px] uppercase tracking-wider font-semibold opacity-80">{label}</span>
    </div>
    <p>{content}</p>
  </div>
);
