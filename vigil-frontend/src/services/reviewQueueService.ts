import { request } from './api';
import type { ReviewQueueListResponse, ReviewQueueItem } from '../types';

export const reviewQueueService = {
  async getReviewQueue(page = 1, pageSize = 20): Promise<ReviewQueueListResponse> {
    return await request<ReviewQueueListResponse>('/review-queue', {
      params: { page, page_size: pageSize },
    });
  },

  async getReviewQueueItem(pullRequestId: string): Promise<ReviewQueueItem> {
    return await request<ReviewQueueItem>(`/review-queue/${pullRequestId}`);
  },
};

