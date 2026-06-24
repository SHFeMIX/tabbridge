import { createActionRequiresConfirmationError, createApprovalRequiredError, errorEnvelope, transitionApproval, type ApprovalRecord, type CliEnvelope } from '@tabbridge/shared'

export type SiteAccessApprovalInput = {
  tabId: number
  title: string
  domain: string
  origin: string
  reason: string
}

export type HighRiskActionApprovalInput = {
  tabId: number
  domain: string
  command: string
  description: string
  riskReasons: string[]
  payloadSummary: string
}

export class ApprovalStore {
  private approvals = new Map<string, ApprovalRecord & { tabId?: number; origin?: string; reason?: string; command?: string }>()

  constructor(
    private readonly now: () => number,
    private readonly createId: () => string,
  ) {}

  createSiteAccessApproval(input: SiteAccessApprovalInput): { approval: ApprovalRecord; envelope: CliEnvelope<never> } {
    const id = this.createId()
    const approval: ApprovalRecord & { tabId: number; origin: string; reason: string } = {
      id,
      kind: 'site-access',
      status: 'pending',
      createdAt: this.now(),
      expiresAt: this.now() + 300_000,
      summary: `Allow ${input.domain} for tab ${input.tabId}: ${input.reason}`,
      executed: false,
      tabId: input.tabId,
      origin: input.origin,
      reason: input.reason,
    }
    this.approvals.set(id, approval)
    return { approval, envelope: errorEnvelope(createApprovalRequiredError({ approvalId: id, expiresAt: approval.expiresAt })) }
  }

  createHighRiskActionApproval(input: HighRiskActionApprovalInput): { approval: ApprovalRecord; envelope: CliEnvelope<never> } {
    const id = this.createId()
    const approval: ApprovalRecord & { tabId: number; command: string } = {
      id,
      kind: 'high-risk-action',
      status: 'pending',
      createdAt: this.now(),
      expiresAt: this.now() + 300_000,
      summary: `${input.description} on ${input.domain}`,
      executed: false,
      tabId: input.tabId,
      command: input.command,
      riskReasons: input.riskReasons,
      payloadSummary: input.payloadSummary,
    }
    this.approvals.set(id, approval)
    return { approval, envelope: errorEnvelope(createActionRequiresConfirmationError({ approvalId: id, expiresAt: approval.expiresAt })) }
  }

  get(id: string): (ApprovalRecord & { tabId?: number; origin?: string; reason?: string; command?: string }) | undefined {
    return this.approvals.get(id)
  }

  transition(id: string, type: 'approve' | 'deny' | 'expire' | 'cancel' | 'mark-executed'): ApprovalRecord | undefined {
    const current = this.approvals.get(id)
    if (!current) return undefined
    const next = transitionApproval(current, { type, now: this.now() } as Parameters<typeof transitionApproval>[1])
    this.approvals.set(id, next)
    return next
  }

  listPending(): ApprovalRecord[] {
    return Array.from(this.approvals.values()).filter((approval) => approval.status === 'pending')
  }
}
