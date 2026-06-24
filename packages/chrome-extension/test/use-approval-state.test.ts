import { describe, expect, it } from 'vitest'
import { useApprovalState } from '../src/ui/useApprovalState'

describe('useApprovalState', () => {
  it('separates pending site approvals from high-risk confirmations', () => {
    const state = useApprovalState()
    state.setApprovals([
      { id: 'appr_site', kind: 'site-access', status: 'pending', createdAt: 1, expiresAt: 2, summary: 'Allow github.com', executed: false },
      { id: 'appr_action', kind: 'high-risk-action', status: 'pending', createdAt: 1, expiresAt: 2, summary: 'Click Delete', executed: false, payloadSummary: '[REDACTED_SECRET length=4]' },
    ])

    expect(state.siteApprovals.value.map((approval) => approval.id)).toEqual(['appr_site'])
    expect(state.highRiskApprovals.value.map((approval) => approval.id)).toEqual(['appr_action'])
  })
})
