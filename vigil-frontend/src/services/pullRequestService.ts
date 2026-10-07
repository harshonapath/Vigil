import { request } from './api';
import type {
  PullRequestRead,
  PullRequestListResponse,
} from '../types';

export const pullRequestService = {
  async getPullRequestsForRepository(
    repositoryId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PullRequestListResponse> {
    return await request<PullRequestListResponse>(
      `/repositories/${repositoryId}/pull-requests`,
      {
        params: {
          page,
          page_size: pageSize,
        },
      },
    );
  },

  async getPullRequestById(
    id: string,
  ): Promise<PullRequestRead> {
    return await request<PullRequestRead>(
      `/pull-requests/${id}`,
    );
  },
};