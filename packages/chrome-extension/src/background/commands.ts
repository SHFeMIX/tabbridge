import { errorEnvelope, okEnvelope, snapshotRequiredError, tabNotAuthorizedError, type BridgeRequest, type CliEnvelope, type TabBridgeErrorCode } from '@tabbridge/shared'
import { ExtensionActionQueue } from './action-queue'
import { createScreenshotController } from './screenshot'
import { getGrants, grantStatusForTab, releaseGrant, setGrants } from './grants'
import { listRedactedTabs } from './tabs'
import { approvalStore } from './approvals'
import { createSiteGrant, originFromUrl, type ChromeTabLike } from '@tabbridge/shared'
import { connectSession, disconnectSession, getSession, markLatestSnapshot } from './session'

const screenshotController = createScreenshotController(() => Date.now())

export type CommandContext = {
  listTabs(): Promise<unknown[]>
  currentTab(): Promise<unknown | undefined>
  getTab?(tabId: number): Promise<ChromeTabLike | undefined>
  sendMessageToTab?(tabId: number, message: unknown): Promise<unknown>
  reloadTab?(tabId: number): Promise<void>
  goBack?(tabId: number): Promise<void>
  goForward?(tabId: number): Promise<void>
}

const actionQueue = new ExtensionActionQueue()
const refActions = new Set(['action.click', 'action.clear', 'action.select', 'action.check', 'action.uncheck', 'action.focus', 'action.fill', 'action.type'])

export async function waitMs(ms: number): Promise<{ waitedMs: number }> {
  await new Promise((resolve) => setTimeout(resolve, ms))
  return { waitedMs: ms }
}

export async function waitForTextInDocument(doc: Document, text: string, timeoutMs: number): Promise<{ found: boolean; text: string }> {
  const started = Date.now()
  while (Date.now() - started <= timeoutMs) {
    if ((doc.body.textContent ?? '').includes(text)) return { found: true, text }
    await waitMs(50)
  }
  return { found: false, text }
}

function tabIdFrom(tab: unknown): number | undefined {
  if (!tab || typeof tab !== 'object') return undefined
  const candidate = tab as { id?: unknown; tabId?: unknown }
  if (typeof candidate.tabId === 'number') return candidate.tabId
  if (typeof candidate.id === 'number') return candidate.id
  return undefined
}

function sessionInputFor(tabId: number, tab: ChromeTabLike | undefined): { tabId: number; title?: string; url?: string } {
  const input: { tabId: number; title?: string; url?: string } = { tabId }
  if (tab?.title !== undefined) input.title = tab.title
  if (tab?.url !== undefined) input.url = tab.url
  return input
}

async function resolveTabId(context: CommandContext | undefined, payload: Record<string, unknown>, connectCurrent = true): Promise<CliEnvelope<number>> {
  if (typeof payload.tabId === 'number') {
    if (connectCurrent) connectSession({ tabId: payload.tabId })
    return okEnvelope(payload.tabId)
  }

  const session = getSession()
  if (session) return okEnvelope(session.tabId)

  const tab = await context?.currentTab?.()
  const tabId = tabIdFrom(tab)
  if (tabId === undefined) {
    return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No focused normal Chrome window has an active tab.', recoverable: true })
  }
  if (connectCurrent) connectSession(sessionInputFor(tabId, tab as ChromeTabLike | undefined))
  return okEnvelope(tabId)
}

async function ensureAuthorized(tabId: number, context: CommandContext | undefined): Promise<CliEnvelope<undefined> | undefined> {
  if (!context?.getTab) {
    return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Tab lookup is not available.', recoverable: false })
  }
  const tab = await context.getTab(tabId)
  if (!tab?.url || grantStatusForTab(getGrants(), { tabId, url: tab.url }, Date.now()) !== 'authorized') {
    return errorEnvelope(tabNotAuthorizedError(tabId))
  }
  return undefined
}

function envelopeFromContentResult(result: unknown): CliEnvelope<unknown> {
  if (result && typeof result === 'object' && 'ok' in result && result.ok === true && 'data' in result) {
    return okEnvelope((result as { data: unknown }).data)
  }
  if (result && typeof result === 'object' && 'ok' in result && result.ok === false && 'error' in result) {
    const errorData = (result as { error: { code: string; message: string; recoverable: boolean; suggestedCommand?: string } }).error
    const error = {
      code: errorData.code as TabBridgeErrorCode,
      message: errorData.message,
      recoverable: errorData.recoverable,
    }
    if (errorData.suggestedCommand) Object.assign(error, { suggestedCommand: errorData.suggestedCommand })
    return errorEnvelope(error)
  }
  return errorEnvelope({ code: 'BROWSER_COMMAND_TIMEOUT', message: 'Unexpected response from content script.', recoverable: true })
}

async function sendContentMessage(tabId: number, context: CommandContext | undefined, message: unknown): Promise<CliEnvelope<unknown>> {
  if (!context?.sendMessageToTab) {
    return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Content messaging is not available.', recoverable: false })
  }
  try {
    return envelopeFromContentResult(await context.sendMessageToTab(tabId, message))
  } catch {
    return errorEnvelope({
      code: 'BROWSER_COMMAND_TIMEOUT',
      message: 'The extension could not communicate with the tab. Confirm the tab is still open and authorized.',
      recoverable: true,
      suggestedCommand: `tabbridge tabs request-access --tab ${tabId} --reason <reason> --json`,
    })
  }
}

export async function routeBridgeCommand(request: BridgeRequest, context?: CommandContext): Promise<CliEnvelope<unknown>> {
  if (request.command === 'status') return okEnvelope({ bridge: 'connected' })

  if (request.command === 'tabs.list' && context) return okEnvelope(await context.listTabs())

  if (request.command === 'tabs.current' && context) {
    const tab = await context.currentTab()
    if (!tab) return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No focused normal Chrome window has an active tab.', recoverable: true })
    return okEnvelope(tab)
  }

  if (request.command === 'session.connect') {
    const payload = request.payload as Record<string, unknown>
    const resolved = await resolveTabId(context, payload, false)
    if (!resolved.ok) return resolved
    const tab = typeof payload.tabId === 'number' ? await context?.getTab?.(resolved.data) : await context?.currentTab?.()
    const session = connectSession(sessionInputFor(resolved.data, tab as ChromeTabLike | undefined))
    return okEnvelope({ connected: true, tabId: session.tabId, title: session.title, url: session.url })
  }

  if (request.command === 'session.status') {
    const session = getSession()
    return okEnvelope(session ? { connected: true, tabId: session.tabId, title: session.title, url: session.url, latestSnapshotAvailable: session.latestSnapshotAvailable } : { connected: false, latestSnapshotAvailable: false })
  }

  if (request.command === 'session.disconnect') {
    disconnectSession()
    return okEnvelope({ disconnected: true })
  }

  if (request.command === 'snapshot') {
    const payload = request.payload as Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const tabId = resolved.data
    const unauthorized = await ensureAuthorized(tabId, context)
    if (unauthorized) return unauthorized
    const result = await sendContentMessage(tabId, context, { type: 'tabbridge.snapshot', tabId, interactive: payload.interactive !== false, includeUrl: true })
    if (result.ok) markLatestSnapshot(tabId, true)
    return result
  }

  if (request.command === 'text') {
    const payload = request.payload as Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const unauthorized = await ensureAuthorized(resolved.data, context)
    if (unauthorized) return unauthorized
    return sendContentMessage(resolved.data, context, { type: 'tabbridge.text', tabId: resolved.data, maxBytes: payload.maxBytes })
  }

  if (request.command === 'html') {
    const payload = request.payload as { ref?: string; frameRef?: string; maxBytes?: number } & Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const unauthorized = await ensureAuthorized(resolved.data, context)
    if (unauthorized) return unauthorized
    if (!getSession()?.latestSnapshotAvailable) return errorEnvelope(snapshotRequiredError())
    return sendContentMessage(resolved.data, context, {
      type: 'tabbridge.html',
      tabId: resolved.data,
      ref: payload.ref,
      frameRef: payload.frameRef ?? 'f0',
      maxBytes: payload.maxBytes,
    })
  }

  if (request.command === 'screenshot') {
    const payload = request.payload as Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const tabId = resolved.data
    const unauthorized = await ensureAuthorized(tabId, context)
    if (unauthorized) return unauthorized
    try {
      const tab = await context?.currentTab()
      const activeTabId = tabIdFrom(tab)
      if (activeTabId !== tabId) {
        return errorEnvelope({
          code: 'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
          message: 'Screenshot is only supported for the current active tab in the selected window.',
          recoverable: true,
          suggestedCommand: `Activate the target tab in Chrome, then retry tabbridge screenshot --json.`,
        })
      }
      const chromeTab = tab as { windowId?: number; active?: boolean }
      return screenshotController.capture(
        { tabId, windowId: chromeTab.windowId ?? 0, active: Boolean(chromeTab.active) },
        async (windowId) => chrome.tabs.captureVisibleTab(windowId, { format: 'png' }),
      )
    } catch {
      return errorEnvelope(tabNotAuthorizedError(tabId))
    }
  }

  if (request.command === 'wait') {
    const payload = request.payload as Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    return actionQueue.run(resolved.data, async () => okEnvelope(await waitMs(Number(payload.ms))))
  }

  if (request.command === 'waitForText') {
    const payload = request.payload as { text?: string; timeoutMs?: number } & Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const unauthorized = await ensureAuthorized(resolved.data, context)
    if (unauthorized) return unauthorized
    return actionQueue.run(resolved.data, async () => sendContentMessage(resolved.data, context, {
      type: 'tabbridge.waitForText',
      text: payload.text,
      timeoutMs: payload.timeoutMs ?? 30_000,
    }))
  }

  if (request.command === 'navigation.reload' || request.command === 'navigation.back' || request.command === 'navigation.forward') {
    const payload = request.payload as Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const tabId = resolved.data
    const unauthorized = await ensureAuthorized(tabId, context)
    if (unauthorized) return unauthorized
    if (!context?.sendMessageToTab) return errorEnvelope({ code: 'BROWSER_COMMAND_TIMEOUT', message: 'Cannot run navigation without an extension command context.', recoverable: true })
    return actionQueue.run(tabId, async () => {
      if (request.command === 'navigation.reload' && context.reloadTab) await context.reloadTab(tabId)
      if (request.command === 'navigation.back' && context.goBack) await context.goBack(tabId)
      if (request.command === 'navigation.forward' && context.goForward) await context.goForward(tabId)
      markLatestSnapshot(tabId, false)
      const envelope = await sendContentMessage(tabId, context, { type: 'tabbridge.clearRefs', tabId })
      if (!envelope.ok) return envelope
      return okEnvelope({ navigated: true, refsCleared: true })
    })
  }

  if (request.command === 'tabs.requestAccess') {
    const payload = request.payload as { tabId: number; reason: string }
    if (!context?.getTab) return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Tab lookup is not available.', recoverable: false })
    const tab = await context.getTab(payload.tabId)
    if (!tab?.url) return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'Tab not found or has no URL.', recoverable: true })
    try {
      const origin = originFromUrl(tab.url)
      const existing = getGrants().find((grant) => grant.tabId === payload.tabId && grant.origin === origin)
      if (existing && existing.expiresAt > Date.now()) return okEnvelope({ granted: true, expiresAt: existing.expiresAt })
      const result = approvalStore.createSiteAccessApproval({
        tabId: payload.tabId,
        title: tab.title ?? 'Untitled tab',
        domain: new URL(tab.url).hostname,
        origin,
        reason: payload.reason,
      })
      return result.envelope
    } catch {
      return errorEnvelope({ code: 'UNSUPPORTED_PAGE', message: 'Cannot request access for this page.', recoverable: false })
    }
  }

  if (request.command === 'tabs.release') {
    const payload = request.payload as { tabId: number }
    setGrants(releaseGrant(getGrants(), payload.tabId))
    return okEnvelope({ released: true })
  }

  if (request.command === 'approvals.status') {
    const payload = request.payload as { approvalId: string }
    const approval = approvalStore.get(payload.approvalId)
    if (!approval) return errorEnvelope({ code: 'APPROVAL_TIMEOUT', message: 'Approval not found.', recoverable: false })
    return okEnvelope({ approval })
  }

  if (request.command === 'approvals.wait') {
    const payload = request.payload as { approvalId: string; timeoutMs?: number }
    const timeoutMs = payload.timeoutMs ?? 30_000
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const approval = approvalStore.get(payload.approvalId)
      if (!approval) return errorEnvelope({ code: 'APPROVAL_TIMEOUT', message: 'Approval not found.', recoverable: false })
      if (approval.status === 'approved') return okEnvelope({ approved: true, approval })
      if (approval.status === 'denied' || approval.status === 'expired' || approval.status === 'canceled') {
        return errorEnvelope({ code: 'USER_DENIED', message: 'Approval was denied, expired, or canceled.', recoverable: false })
      }
      await waitMs(250)
    }
    return errorEnvelope({ code: 'APPROVAL_TIMEOUT', message: 'Timed out waiting for approval.', recoverable: true })
  }

  if (request.command === 'approvals.cancel') {
    const payload = request.payload as { approvalId: string }
    const approval = approvalStore.transition(payload.approvalId, 'cancel')
    if (!approval) return errorEnvelope({ code: 'APPROVAL_TIMEOUT', message: 'Approval not found.', recoverable: false })
    return okEnvelope({ canceled: true, approval })
  }

  if (refActions.has(request.command)) {
    const payload = request.payload as { ref?: string; frameRef?: string; text?: string; value?: string } & Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const tabId = resolved.data
    const unauthorized = await ensureAuthorized(tabId, context)
    if (unauthorized) return unauthorized
    if (!getSession()?.latestSnapshotAvailable) return errorEnvelope(snapshotRequiredError())
    const command = request.command.replace('action.', '')
    return runActionOnTab(tabId, context, {
      type: 'tabbridge.action',
      command,
      tabId,
      frameRef: payload.frameRef ?? 'f0',
      ref: payload.ref,
      text: payload.text,
      value: payload.value,
    })
  }

  if (request.command === 'action.press') {
    const payload = request.payload as { key: string } & Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    return runActionOnTab(resolved.data, context, { type: 'tabbridge.press', tabId: resolved.data, key: payload.key })
  }

  if (request.command === 'action.scroll') {
    const payload = request.payload as { dx?: number; dy?: number } & Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    return runActionOnTab(resolved.data, context, { type: 'tabbridge.scroll', tabId: resolved.data, dx: payload.dx ?? 0, dy: payload.dy ?? 0 })
  }

  if (request.command === 'action.clickCoordinates') {
    const payload = request.payload as { x: number; y: number } & Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const confirm = await createCoordinateActionApproval(resolved.data, 'click-coordinates', `Click coordinates (${payload.x}, ${payload.y})`, context)
    if (confirm) return confirm
    return runActionOnTab(resolved.data, context, { type: 'tabbridge.clickCoordinates', tabId: resolved.data, x: payload.x, y: payload.y })
  }

  if (request.command === 'action.dragCoordinates') {
    const payload = request.payload as { fromX: number; fromY: number; toX: number; toY: number } & Record<string, unknown>
    const resolved = await resolveTabId(context, payload)
    if (!resolved.ok) return resolved
    const confirm = await createCoordinateActionApproval(resolved.data, 'drag-coordinates', `Drag coordinates from (${payload.fromX}, ${payload.fromY}) to (${payload.toX}, ${payload.toY})`, context)
    if (confirm) return confirm
    return runActionOnTab(resolved.data, context, { type: 'tabbridge.dragCoordinates', tabId: resolved.data, fromX: payload.fromX, fromY: payload.fromY, toX: payload.toX, toY: payload.toY })
  }

  return errorEnvelope({
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Command ${request.command} is not implemented by the extension command router yet.`,
    recoverable: false,
  })
}

async function runActionOnTab(tabId: number, context: CommandContext | undefined, message: unknown): Promise<CliEnvelope<unknown>> {
  const unauthorized = await ensureAuthorized(tabId, context)
  if (unauthorized) return unauthorized
  return sendContentMessage(tabId, context, message)
}

async function createCoordinateActionApproval(tabId: number, command: string, description: string, context: CommandContext | undefined): Promise<CliEnvelope<never> | undefined> {
  let domain = 'current-tab'
  if (context?.getTab) {
    const tab = await context.getTab(tabId)
    if (tab?.url) {
      try {
        domain = new URL(tab.url).hostname
      } catch {
        domain = 'current-tab'
      }
    }
  }
  const result = approvalStore.createHighRiskActionApproval({
    tabId,
    domain,
    command,
    description,
    riskReasons: ['coordinate action cannot be tied to a stable semantic ref'],
    payloadSummary: '[COORDINATES_REDACTED]',
  })
  return result.envelope
}

export async function routeBridgeMethod(method: string, _params: unknown): Promise<unknown> {
  const request: BridgeRequest = {
    id: 'legacy',
    protocolVersion: 1 as const,
    source: 'cli',
    target: 'extension',
    command: method,
    payload: typeof _params === 'object' && _params !== null ? _params as Record<string, unknown> : {},
    createdAt: Date.now(),
  }

  const context: CommandContext = {
    async listTabs() {
      const chromeTabs = await chrome.tabs.query({})
      return listRedactedTabs(chromeTabs.map(toChromeTabLike), getGrants(), Date.now())
    },
    async currentTab() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab) return undefined
      return listRedactedTabs([toChromeTabLike(tab)], getGrants(), Date.now())[0]
    },
    async getTab(tabId: number) {
      try {
        const tab = await chrome.tabs.get(tabId)
        return toChromeTabLike(tab)
      } catch {
        return undefined
      }
    },
    async sendMessageToTab(tabId: number, message: unknown) {
      return await chrome.tabs.sendMessage(tabId, message)
    },
  }

  const envelope = await routeBridgeCommand(request, context)
  if (envelope.ok) return envelope.data
  throw envelope.error
}

function toChromeTabLike(tab: chrome.tabs.Tab): import('@tabbridge/shared').ChromeTabLike {
  const tabLike: import('@tabbridge/shared').ChromeTabLike = {
    windowId: tab.windowId,
    active: tab.active,
  }
  if (tab.id !== undefined) tabLike.id = tab.id
  if (tab.title !== undefined) tabLike.title = tab.title
  if (tab.url !== undefined) tabLike.url = tab.url
  if (tab.favIconUrl !== undefined) tabLike.favIconUrl = tab.favIconUrl
  return tabLike
}
