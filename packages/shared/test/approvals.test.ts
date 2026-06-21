import { describe, expect, it } from 'vitest'
import { createApprovalRequiredError, transitionApproval } from '../src/index.js'

describe('approval state machine', () => {
  it('returns poll metadata when user approval is required', () => {
    expect(createApprovalRequiredError({ approvalId: 'appr_123', expiresAt: 1782012345678 })).toEqual({
      code: 'USER_APPROVAL_REQUIRED',
      message: 'Approval is required in the TabBridge extension UI.',
      recoverable: true,
      approvalId: 'appr_123',
      expiresAt: 1782012345678,
      pollCommand: 'tabbridge approvals wait --id appr_123 --json',
    })
  })

  it('moves pending approvals to approved only once', () => {
    const pending = {
      id: 'appr_123',
      kind: 'site-access' as const,
      status: 'pending' as const,
      createdAt: 1782010000000,
      expiresAt: 1782010300000,
      summary: 'Allow github.com',
      executed: false,
    }

    const approved = transitionApproval(pending, { type: 'approve', now: 1782010010000 })
    expect(approved.status).toBe('approved')
    expect(approved.executed).toBe(false)

    const executed = transitionApproval(approved, { type: 'mark-executed', now: 1782010011000 })
    expect(executed.status).toBe('executed')
    expect(executed.executed).toBe(true)

    const repeated = transitionApproval(executed, { type: 'mark-executed', now: 1782010012000 })
    expect(repeated).toEqual(executed)
  })

  it('expires pending approvals without converting them to user denial', () => {
    const pending = {
      id: 'appr_456',
      kind: 'high-risk-action' as const,
      status: 'pending' as const,
      createdAt: 1782010000000,
      expiresAt: 1782010300000,
      summary: 'Click Delete repository',
      executed: false,
    }

    expect(transitionApproval(pending, { type: 'expire', now: 1782010300001 })).toMatchObject({
      status: 'expired',
      executed: false,
    })
  })

  it('expires pending approvals instead of approving after the approval deadline', () => {
    const pending = {
      id: 'appr_789',
      kind: 'site-access' as const,
      status: 'pending' as const,
      createdAt: 1782010000000,
      expiresAt: 1782010300000,
      summary: 'Allow docs.example.com',
      executed: false,
    }

    expect(transitionApproval(pending, { type: 'approve', now: 1782010300001 })).toMatchObject({
      status: 'expired',
      executed: false,
    })
  })

  it('expires approved approvals instead of executing after the approval deadline', () => {
    const approved = {
      id: 'appr_987',
      kind: 'high-risk-action' as const,
      status: 'approved' as const,
      createdAt: 1782010000000,
      expiresAt: 1782010300000,
      summary: 'Click Delete repository',
      executed: false,
    }

    expect(transitionApproval(approved, { type: 'mark-executed', now: 1782010300001 })).toMatchObject({
      status: 'expired',
      executed: false,
    })
  })
})
