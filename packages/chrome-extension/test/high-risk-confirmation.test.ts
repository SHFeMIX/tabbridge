import { describe, expect, it } from 'vitest'
import { ApprovalStore } from '../src/background/approvals'

describe('high-risk action approvals', () => {
  it('creates redacted one-shot confirmation for credential-like typing', () => {
    const store = new ApprovalStore(() => 1782010000000, () => 'appr_secret')
    const result = store.createHighRiskActionApproval({
      tabId: 1,
      domain: 'example.com',
      command: 'type',
      description: 'Type into Password',
      riskReasons: ['field accepts password or credential-like input'],
      payloadSummary: '[REDACTED_SECRET length=12]',
    })

    expect(result.envelope).toEqual({
      ok: false,
      error: {
        code: 'ACTION_REQUIRES_CONFIRMATION',
        message: 'This action requires confirmation in the TabBridge extension UI.',
        recoverable: true,
        approvalId: 'appr_secret',
        expiresAt: 1782010300000,
        pollCommand: 'tabbridge approvals wait --id appr_secret --json',
      },
    })
    expect(JSON.stringify(store.get('appr_secret'))).not.toContain('hunter2')
  })
})
