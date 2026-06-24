import { describe, expect, it } from 'vitest'
import { ApprovalStore } from '../src/background/approvals'

describe('extension approval store', () => {
  it('creates pending site access approvals with poll metadata', () => {
    const store = new ApprovalStore(() => 1782010000000, () => 'appr_1')
    const result = store.createSiteAccessApproval({ tabId: 1, title: 'GitHub PR', domain: 'github.com', origin: 'https://github.com', reason: 'Review PR' })

    expect(result.envelope).toEqual({
      ok: false,
      error: {
        code: 'USER_APPROVAL_REQUIRED',
        message: 'Approval is required in the TabBridge extension UI.',
        recoverable: true,
        approvalId: 'appr_1',
        expiresAt: 1782010300000,
        pollCommand: 'tabbridge approvals wait --id appr_1 --json',
      },
    })
    expect(store.get('appr_1')).toMatchObject({ status: 'pending', summary: 'Allow github.com for tab 1: Review PR' })
  })
})
