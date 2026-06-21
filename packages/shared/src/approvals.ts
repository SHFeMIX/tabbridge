import type { TabBridgeError } from './errors.js'

export type ApprovalKind = 'site-access' | 'high-risk-action'
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'executed' | 'canceled'

export type ApprovalRecord = {
  id: string
  kind: ApprovalKind
  status: ApprovalStatus
  createdAt: number
  expiresAt: number
  summary: string
  executed: boolean
  riskReasons?: string[]
  payloadSummary?: string
}

export type ApprovalTransition =
  | { type: 'approve'; now: number }
  | { type: 'deny'; now: number }
  | { type: 'expire'; now: number }
  | { type: 'cancel'; now: number }
  | { type: 'mark-executed'; now: number }

export function createApprovalRequiredError(input: { approvalId: string; expiresAt: number }): TabBridgeError {
  return {
    code: 'USER_APPROVAL_REQUIRED',
    message: 'Approval is required in the TabBridge extension UI.',
    recoverable: true,
    approvalId: input.approvalId,
    expiresAt: input.expiresAt,
    pollCommand: `tabbridge approvals wait --id ${input.approvalId} --json`,
  }
}

export function createActionRequiresConfirmationError(input: { approvalId: string; expiresAt: number }): TabBridgeError {
  return {
    code: 'ACTION_REQUIRES_CONFIRMATION',
    message: 'This action requires confirmation in the TabBridge extension UI.',
    recoverable: true,
    approvalId: input.approvalId,
    expiresAt: input.expiresAt,
    pollCommand: `tabbridge approvals wait --id ${input.approvalId} --json`,
  }
}

export function transitionApproval(record: ApprovalRecord, transition: ApprovalTransition): ApprovalRecord {
  if (record.status === 'executed' || record.status === 'denied' || record.status === 'expired' || record.status === 'canceled') {
    return record
  }

  if (transition.now > record.expiresAt) {
    return { ...record, status: 'expired', executed: false }
  }

  if (transition.type === 'approve') {
    return { ...record, status: 'approved' }
  }

  if (transition.type === 'deny') {
    return { ...record, status: 'denied' }
  }

  if (transition.type === 'expire') {
    return transition.now > record.expiresAt ? { ...record, status: 'expired' } : record
  }

  if (transition.type === 'cancel') {
    return { ...record, status: 'canceled' }
  }

  return record.status === 'approved' ? { ...record, status: 'executed', executed: true } : record
}
