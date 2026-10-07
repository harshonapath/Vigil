import { request } from './api';
import type {
  CommitRead,
  CommitListResponse,
  CommitAnalysisRead,
} from '../types';

export const commitService = {
  async getCommitsForPR(
    pullRequestId: string,
    page = 1,
    pageSize = 20,
  ): Promise<CommitListResponse> {
    return await request<CommitListResponse>(`/pull-requests/${pullRequestId}/commits`, {
      params: { page, page_size: pageSize },
    });
  },

  async getCommitBySha(sha: string): Promise<CommitRead> {
    return await request<CommitRead>(`/commits/${sha}`);
  },

  async triggerCommitAnalysis(sha: string): Promise<CommitAnalysisRead> {
    return await request<CommitAnalysisRead>(`/commits/${sha}/analyze`, {
      method: 'POST',
    });
  },

  async getCommitAnalysisBySha(sha: string): Promise<CommitAnalysisRead | null> {
    try {
      return await request<CommitAnalysisRead>(`/commits/${sha}/analysis`);
    } catch {
      return null;
    }
  },

  async getCommitAnalysisById(id: string): Promise<CommitAnalysisRead> {
    return await request<CommitAnalysisRead>(`/commit-analyses/${id}`);
  },
};

