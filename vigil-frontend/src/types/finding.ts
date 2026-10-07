import type { PaginatedResponse } from './api';

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type FindingSource =
  | 'SEMGREP'
  | 'GITLEAKS'
  | 'TRIVY'
  | 'MS_SECURITY_DEVOPS'
  | 'AI_REVIEW'
  | string;

export type FindingCategory =
  | 'SECURITY'
  | 'PROMPT_INJECTION'
  | 'COMPLEXITY'
  | 'EDGE_CASE'
  | 'SECURITY_ASSUMPTION'
  | 'LOGIC'
  | 'ERROR_HANDLING'
  | 'TESTING'
  | 'MAINTAINABILITY'
  | 'CODE_QUALITY'
  | 'DOCUMENTATION'
  | 'PERFORMANCE'
  | string;


export type FindingStatus = 'OPEN' | 'ACKNOWLEDGED' | 'FALSE_POSITIVE' | 'RESOLVED' | string;

export interface FindingEvidence {
  problem?: string;
  why?: string;
  evidence?: string;
  suggestion?: string;
  code_snippet?: string;
  description?: string;
  current_time_complexity?: string;
  suggested_time_complexity?: string;
  current_space_complexity?: string;
  suggested_space_complexity?: string;
  edge_case_type?: string;
  scenario?: string;
  expected_behavior?: string;
  current_behavior?: string;
  potential_impact?: string;
  assumption_name?: string;
  scope?: string;
  previous_assumption?: string;
  new_assumption?: string;
  change_type?: string;
  potential_repercussions?: string;
  [key: string]: unknown;
}

export interface FindingRead {
  id: string; // uuid
  analysis_id: string; // uuid
  source: FindingSource;
  category: FindingCategory;
  severity: FindingSeverity | string;
  rule_id: string | null;
  fingerprint: string;
  file_path: string | null;
  start_line: number | null;
  end_line: number | null;
  message: string;
  status: FindingStatus;
  evidence: FindingEvidence | null;
  raw_artifact_uri: string | null;
  created_at: string;
}

export type FindingListResponse = PaginatedResponse<FindingRead>;

export interface FindingVerificationRead {
  id: string;
  finding_id: string;
  reviewer_login: string;
  decision: 'VERIFIED' | 'REJECTED' | 'DISMISSED' | string;
  comment?: string | null;
  created_at: string;
}

export interface FindingVerificationList {
  items: FindingVerificationRead[];
  total: number;
}

export interface FindingDetail extends FindingRead {
  verification_history?: FindingVerificationRead[];
  analysis?: {
    id: string;
    head_sha: string;
    status: string;
    trigger_type: string;
    created_at: string;
  };
  pull_request?: {
    id: string;
    pr_number: number;
    title: string;
    head_sha: string;
    source_branch: string;
    target_branch: string;
    status: string;
  };
  repository?: {
    id: string;
    full_name: string;
    owner_login: string;
    name: string;
    html_url: string;
  };
}

export interface FindingQueueItem {
  finding_id: string;
  analysis_id: string;
  repository_full_name?: string | null;
  repository_id?: string | null;
  pull_request_id?: string | null;
  pull_request_number?: number | null;
  commit_sha?: string | null;
  file_path?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  severity: FindingSeverity | string;
  category: FindingCategory;
  source: FindingSource;
  title: string;
  status: FindingStatus;
  created_at: string;
}

export type FindingQueueListResponse = PaginatedResponse<FindingQueueItem>;
