import { request } from './api';
import type {
  FindingListResponse,
  FindingSeverity,
  FindingSource,
  FindingStatus,
  FindingQueueListResponse,
  FindingDetail,
  FindingVerificationList,
} from '../types';

export interface FindingFilterOptions {
  severity?: FindingSeverity | string;
  status?: FindingStatus;
  source?: FindingSource;
  page?: number;
  pageSize?: number;
}

export const findingService = {
  async getFindingsForPR(
    pullRequestId: string,
    filters: FindingFilterOptions = {},
  ): Promise<FindingListResponse> {
    const { severity, status, source, page = 1, pageSize = 50 } = filters;

    return await request<FindingListResponse>(`/pull-requests/${pullRequestId}/findings`, {
      params: {
        severity: severity || undefined,
        status: status || undefined,
        source: source || undefined,
        page,
        page_size: pageSize,
      },
    });
  },

  async getFindingsReviewQueue(params: {
    status?: string;
    severity?: string;
    repository_id?: string;
    pull_request_id?: string;
    commit_sha?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<FindingQueueListResponse> {
    return await request<FindingQueueListResponse>('/findings/queue', {
      params: {
        status: params.status || undefined,
        severity: params.severity || undefined,
        repository_id: params.repository_id || undefined,
        pull_request_id: params.pull_request_id || undefined,
        commit_sha: params.commit_sha || undefined,
        page: params.page || 1,
        page_size: params.pageSize || 20,
      },
    });
  },

  async getFindingDetail(findingId: string): Promise<FindingDetail> {
    return await request<FindingDetail>(`/findings/${findingId}`);
  },

  async verifyFinding(
    findingId: string,
    decision: 'VERIFIED' | 'REJECTED' | 'DISMISSED',
    comment?: string,
    expectedStatus?: string
  ): Promise<FindingDetail> {
    return await request<FindingDetail>(`/findings/${findingId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment: comment || undefined }),
      params: expectedStatus ? { expected_status: expectedStatus } : undefined,
    });
  },

  async getFindingHistory(findingId: string): Promise<FindingVerificationList> {
    return await request<FindingVerificationList>(`/findings/${findingId}/history`);
  },
};


