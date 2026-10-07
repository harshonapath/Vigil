import { request } from './api';
import type {
  RepositoryRead,
  RepositoryListResponse,
} from '../types';

export const repositoryService = {

  // GET /api/v1/me/repositories
  async getMyRepositories(
    page = 1,
    pageSize = 20,
    installationId?: number | null,
  ): Promise<RepositoryListResponse> {
    const params: Record<string, string | number | boolean | undefined | null> = {
      page,
      page_size: pageSize,
    };
    if (installationId) {
      params.installation_id = installationId;
    }
    return await request<RepositoryListResponse>(
      '/me/repositories',
      { params },
    );
  },

  // GET /api/v1/repositories/{id}
  async getRepositoryById(
    id: string
  ): Promise<RepositoryRead> {
    return await request<RepositoryRead>(
      `/repositories/${id}`
    );
  },
};