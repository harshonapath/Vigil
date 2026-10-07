import { request, ApiException } from './api';
import type { UserRead, RepositoryListResponse } from '../types';

export const authService = {
  async getCurrentUser(): Promise<UserRead> {
    return await request<UserRead>('/me');
  },

  async getUserRepositories(page = 1, pageSize = 20): Promise<RepositoryListResponse> {
    try {
      // First try /me/repositories
      return await request<RepositoryListResponse>('/me/repositories', {
        params: { page, page_size: pageSize },
      });
    } catch (error) {
      // If 404, fall back to /repositories
      if (error instanceof ApiException && error.status === 404) {
        return await request<RepositoryListResponse>('/repositories', {
          params: { page, page_size: pageSize },
        });
      }
      throw error;
    }
  },
};

