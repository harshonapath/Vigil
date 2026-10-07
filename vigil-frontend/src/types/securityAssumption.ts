export interface AssumptionEvidenceRead {
  id: string;
  path: string;
  symbol?: string | null;
  start_line: number;
  end_line: number;
  excerpt: string;
  evidence_type: string;
  commit_sha: string;
  validation_status: string;
}

export interface AssumptionVersionRead {
  id: string;
  analysis_id: string;
  statement: string;
  category: string;
  scope: string;
  confidence: number;
  rationale: string;
  potential_impact: string;
  evidence_strength: 'E0' | 'E1' | 'E2' | 'E3' | 'E4';
  head_sha: string;
  created_at: string;
  evidence: AssumptionEvidenceRead[];
}

export interface AssumptionChangeRead {
  id: string;
  repository_id: string;
  analysis_id: string;
  assumption_id?: string | null;
  prior_version_id?: string | null;
  new_version_id?: string | null;
  classification: 'UNCHANGED' | 'CHANGED' | 'POTENTIALLY_INVALIDATED' | 'INSUFFICIENT_EVIDENCE' | 'NEW' | 'NOT_OBSERVED' | 'RESOLVED' | 'ACCEPTED';
  impact_summary: string;
  risk_level: string;
  blast_radius_status: string;
  blast_radius_items: string[];
  confidence: number;
  review_status: string;
  decision_version: number;
  created_at: string;
  prior_version?: AssumptionVersionRead | null;
  new_version?: AssumptionVersionRead | null;
  decisions: AssumptionDecisionRead[];
}

export interface AssumptionDecisionRead {
  id: string;
  change_id: string;
  reviewer_login: string;
  decision: 'APPROVE' | 'REQUEST_CHANGES' | 'ACCEPT_RISK' | 'DISMISS' | 'MARK_RESOLVED';
  expected_version: number;
  idempotency_key: string;
  comment?: string | null;
  created_at: string;
}

export interface AssumptionChangeList {
  items: AssumptionChangeRead[];
  page: number;
  page_size: number;
  total: number;
  extraction_status?: string | null;
  context_file_count: number;
  validated_evidence_count: number;
  provider?: string | null;
  model?: string | null;
  fallback_used: boolean;
  latency_ms: number;
  retry_count: number;
  token_usage?: Record<string, number | null> | null;
  failure_code?: string | null;
}
