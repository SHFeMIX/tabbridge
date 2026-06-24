### Task 6: Tab Discovery, Grants, and Approval State

**Files:**
- Modify: `packages/chrome-extension/src/background/commands.ts`
- Create: `packages/chrome-extension/src/background/tabs.ts`
- Create: `packages/chrome-extension/src/background/grants.ts`
- Create: `packages/chrome-extension/src/background/approvals.ts`
- Test: `packages/chrome-extension/test/tabs.test.ts`
- Test: `packages/chrome-extension/test/grants.test.ts`
- Test: `packages/chrome-extension/test/approvals.test.ts`

**Interfaces:**
- Consumes: `RedactedTab`, `SiteGrant`, `ApprovalRecord`, `createSiteGrant`, `createApprovalRequiredError`, and `hostPermissionPatternFromOrigin`.
- Produces: `listRedactedTabs(chromeTabs, grants, now): RedactedTab[]`, `requestTabAccess(input): Promise<CliEnvelope<unknown>>`, `releaseTabGrant(tabId): Promise<void>`, `ApprovalStore`, and routed commands for `tabs.list`, `tabs.current`, `tabs.requestAccess`, `tabs.release`, `approvals.status`, `approvals.wait`, and `approvals.cancel`.

- [ ] **Step 1: Write failing tab/grant/approval tests**

Create `packages/chrome-extension/test/tabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { listRedactedTabs } from '../src/background/tabs'

describe('extension tab discovery', () => {
  it('returns redacted metadata and access status only', () => {
    const tabs = listRedactedTabs([
      { id: 1, windowId: 2, active: true, title: 'GitHub PR', url: 'https://github.com/acme/repo/pull/1?secret=1', favIconUrl: 'https://github.com/favicon.ico' },
    ], [], 1782010000000)

    expect(tabs).toEqual([{ tabId: 1, windowId: 2, title: 'GitHub PR', domain: 'github.com', active: true, accessStatus: 'none' }])
    expect(JSON.stringify(tabs)).not.toContain('secret=1')
    expect(JSON.stringify(tabs)).not.toContain('favicon')
  })
})
```

Create `packages/chrome-extension/test/grants.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { grantStatusForTab } from '../src/background/grants'

describe('grant status', () => {
  it('authorizes only matching tab and origin before expiry', () => {
    const grants = [{ tabId: 1, origin: 'https://github.com', grantedByUserAt: 1000, expiresAt: 2000, source: 'user-click' as const }]

    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://github.com/acme/repo' }, 1500)).toBe('authorized')
    expect(grantStatusForTab(grants, { tabId: 2, url: 'https://github.com/acme/repo' }, 1500)).toBe('none')
    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://example.com' }, 1500)).toBe('expired-or-cross-origin')
    expect(grantStatusForTab(grants, { tabId: 1, url: 'https://github.com/acme/repo' }, 2500)).toBe('expired-or-cross-origin')
  })
})
```

Create `packages/chrome-extension/test/approvals.test.ts`:

```ts
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
```

- [ ] **Step 2: Run extension tests to verify they fail**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test -- tabs grants approvals
```

Expected: tests fail because tab/grant/approval modules do not exist.

- [ ] **Step 3: Implement discovery, grants, and approval store**

Create `packages/chrome-extension/src/background/grants.ts`:

```ts
import { originFromUrl, type AccessStatus, type SiteGrant } from '@tabbridge/shared'

export function grantStatusForTab(grants: SiteGrant[], tab: { tabId: number; url?: string }, now: number): AccessStatus {
  if (!tab.url) return 'none'

  let origin: string
  try {
    origin = originFromUrl(tab.url)
  } catch {
    return 'none'
  }

  const sameTabGrant = grants.find((grant) => grant.tabId === tab.tabId)
  if (!sameTabGrant) return 'none'
  if (sameTabGrant.origin === origin && sameTabGrant.expiresAt > now) return 'authorized'
  return 'expired-or-cross-origin'
}

export function releaseGrant(grants: SiteGrant[], tabId: number): SiteGrant[] {
  return grants.filter((grant) => grant.tabId !== tabId)
}
```

Create `packages/chrome-extension/src/background/tabs.ts`:

```ts
import { redactChromeTab, type ChromeTabLike, type RedactedTab, type SiteGrant } from '@tabbridge/shared'
import { grantStatusForTab } from './grants'

export function listRedactedTabs(chromeTabs: ChromeTabLike[], grants: SiteGrant[], now: number): RedactedTab[] {
  return chromeTabs
    .filter((tab) => typeof tab.id === 'number')
    .map((tab) => redactChromeTab(tab, grantStatusForTab(grants, { tabId: tab.id as number, url: tab.url }, now)))
}
```

Create `packages/chrome-extension/src/background/approvals.ts`:

```ts
import { createApprovalRequiredError, errorEnvelope, transitionApproval, type ApprovalRecord, type CliEnvelope } from '@tabbridge/shared'

export type SiteAccessApprovalInput = {
  tabId: number
  title: string
  domain: string
  origin: string
  reason: string
}

export class ApprovalStore {
  private approvals = new Map<string, ApprovalRecord & { tabId?: number; origin?: string; reason?: string }>()

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

  get(id: string): (ApprovalRecord & { tabId?: number; origin?: string; reason?: string }) | undefined {
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
```

Update `packages/chrome-extension/src/background/commands.ts` to route tab and approval commands using injected handlers:

```ts
import { errorEnvelope, okEnvelope, tabNotAuthorizedError, type BridgeRequest, type CliEnvelope } from '@tabbridge/shared'

export type CommandContext = {
  listTabs(): Promise<unknown[]>
  currentTab(): Promise<unknown | undefined>
}

export async function routeBridgeCommand(request: BridgeRequest, context?: CommandContext): Promise<CliEnvelope<unknown>> {
  if (request.command === 'status') {
    return okEnvelope({ bridge: 'connected' })
  }

  if (request.command === 'tabs.list' && context) {
    return okEnvelope(await context.listTabs())
  }

  if (request.command === 'tabs.current' && context) {
    const tab = await context.currentTab()
    if (!tab) {
      return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No focused normal Chrome window has an active tab.', recoverable: true })
    }
    return okEnvelope(tab)
  }

  if (request.command === 'snapshot') {
    const payload = request.payload as { tabId: number }
    return errorEnvelope(tabNotAuthorizedError(payload.tabId))
  }

  return errorEnvelope({
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Command ${request.command} is not implemented by the extension command router yet.`,
    recoverable: false,
  })
}
```

- [ ] **Step 4: Run extension tests and typecheck**

Run:

```bash
pnpm --filter @tabbridge/chrome-extension test
pnpm --filter @tabbridge/chrome-extension typecheck
```

Expected: tab discovery, grant status, approval store, and previous extension tests pass. TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/chrome-extension
git commit -m "feat: add extension tab discovery and approval state"
```

---

