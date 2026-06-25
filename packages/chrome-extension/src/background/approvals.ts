import { createActionRequiresConfirmationError, createApprovalRequiredError, errorEnvelope, transitionApproval, type ApprovalRecord, type CliEnvelope } from '@tabbridge/shared'

const APPROVALS_STORAGE_KEY = 'tabbridge.approvals'

type StoredApprovalRecord = ApprovalRecord & { tabId?: number; origin?: string; reason?: string; command?: string }
type StorageLocal = Pick<chrome.storage.LocalStorageArea, 'get' | 'set'>

function storageLocal(): StorageLocal | undefined {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined
  if (typeof chrome.storage.local.get !== 'function' || typeof chrome.storage.local.set !== 'function') return undefined
  return chrome.storage.local
}

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
  private approvals = new Map<string, StoredApprovalRecord>()

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
    void this.persist()
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
    void this.persist()
    return { approval, envelope: errorEnvelope(createActionRequiresConfirmationError({ approvalId: id, expiresAt: approval.expiresAt })) }
  }

  get(id: string): StoredApprovalRecord | undefined {
    return this.approvals.get(id)
  }

  transition(id: string, type: 'approve' | 'deny' | 'expire' | 'cancel' | 'mark-executed'): ApprovalRecord | undefined {
    const current = this.approvals.get(id)
    if (!current) return undefined
    const next = transitionApproval(current, { type, now: this.now() } as Parameters<typeof transitionApproval>[1]) as StoredApprovalRecord
    this.approvals.set(id, next)
    void this.persist()
    return next
  }

  async hydrate(): Promise<void> {
    const storage = storageLocal()
    if (!storage) return
    const stored = await storage.get(APPROVALS_STORAGE_KEY)
    const value = stored[APPROVALS_STORAGE_KEY]
    if (Array.isArray(value)) {
      this.approvals = new Map(value.filter(isStoredApproval).map((approval) => [approval.id, approval]))
    }
  }

  listPending(): ApprovalRecord[] {
    return Array.from(this.approvals.values()).filter((approval) => approval.status === 'pending')
  }

  private async persist(): Promise<void> {
    const storage = storageLocal()
    if (!storage) return
    await storage.set({ [APPROVALS_STORAGE_KEY]: Array.from(this.approvals.values()) })
  }
}

function isStoredApproval(value: unknown): value is StoredApprovalRecord {
  const candidate = value as Partial<ApprovalRecord>
  return typeof candidate.id === 'string'
    && (candidate.kind === 'site-access' || candidate.kind === 'high-risk-action')
    && typeof candidate.status === 'string'
    && typeof candidate.createdAt === 'number'
    && typeof candidate.expiresAt === 'number'
    && typeof candidate.summary === 'string'
    && typeof candidate.executed === 'boolean'
}

export const approvalStore = new ApprovalStore(
  () => Date.now(),
  () => `appr_${Date.now()}_${Math.random().toString(36).slice(2)}`,
)
