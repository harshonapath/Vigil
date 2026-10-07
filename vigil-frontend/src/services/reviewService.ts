import { request, ApiException } from './api';
import type { ReviewRead } from '../types';

export interface PublishResult {
  success: boolean;
  status: number;
  message: string;
}

export const reviewService = {
  async getReviewForPR(pullRequestId: string): Promise<ReviewRead> {
    try {
      return await request<ReviewRead>(`/pull-requests/${pullRequestId}/review`);
    } catch (error) {
      if (error instanceof ApiException) {
        // If 404, no review has been generated yet
        if (error.status === 404) {
          throw new ApiException(404, 'No review has been generated for this pull request yet.');
        }
      }
      throw error;
    }
  },


  async publishReview(reviewId: string): Promise<PublishResult> {
    try {
      const response = await request<{ message?: string }>(`/reviews/${reviewId}/publish`, {
        method: 'POST',
      });
      return {
        success: true,
        status: 200,
        message: response.message || 'Review successfully published to GitHub.',
      };
    } catch (error) {
      if (error instanceof ApiException) {
        if (error.status === 501) {
          return {
            success: false,
            status: 501,
            message:
              error.data.detail && typeof error.data.detail === 'string'
                ? error.data.detail
                : 'GitHub review publishing is not implemented yet in this phase (Phase 4 feature).',
          };
        }
        return {
          success: false,
          status: error.status,
          message: error.message || 'Failed to publish review to repository.',
        };
      }
      return {
        success: false,
        status: 500,
        message: error instanceof Error ? error.message : 'Unknown publish failure.',
      };
    }
  },
};
