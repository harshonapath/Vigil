import { request } from './api';
import type { AssumptionChangeList, AssumptionChangeRead } from '../types/securityAssumption';

export const securityAssumptionService = {
  listForAnalysis(analysisId: string, page = 1, pageSize = 50) {
    return request<AssumptionChangeList>(`/analyses/${analysisId}/security-assumption-changes`, {
      params: { page, page_size: pageSize },
    });
  },
  decide(changeId: string, decision: 'APPROVE' | 'REQUEST_CHANGES' | 'ACCEPT_RISK' | 'DISMISS' | 'MARK_RESOLVED', expectedVersion: number) {
    return request(`/security-assumption-changes/${changeId}/decision`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        expected_version: expectedVersion,
        idempotency_key: crypto.randomUUID(),
      }),
    });
  },
  get(changeId: string) {
    return request<AssumptionChangeRead>(`/security-assumption-changes/${changeId}`);
  },
};
