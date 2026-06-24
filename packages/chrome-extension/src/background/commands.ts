import { errorEnvelope, okEnvelope, tabNotAuthorizedError, type BridgeRequest, type CliEnvelope, type TabBridgeErrorCode } from '@tabbridge/shared'
import { ExtensionActionQueue } from './action-queue'
import { createScreenshotController } from './screenshot'
import { addGrant, getGrants, grantStatusForTab, releaseGrant, setGrants } from './grants'
import { listRedactedTabs } from './tabs'
import { approvalStore } from './approvals'
import { classifyRisk, createSiteGrant, originFromUrl, type ChromeTabLike, type SiteGrant } from '@tabbridge/shared'

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
    const payload = request.payload as { tabId: number; snapshotId?: string; includeUrl?: boolean }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Snapshot messaging is not available.', recoverable: false })
    }
    try {
      const result = await context.sendMessageToTab(payload.tabId, {
        type: 'tabbridge.snapshot',
        tabId: payload.tabId,
        snapshotId: payload.snapshotId ?? `snap_${Date.now()}`,
        includeUrl: payload.includeUrl,
      })
      if (result && typeof result === 'object' && 'ok' in result && result.ok === true && 'data' in result) {
        return okEnvelope(result.data)
      }
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false && 'error' in result) {
        const errorData = result.error as { code: string; message: string; recoverable: boolean; suggestedCommand?: string }
        const error = {
          code: errorData.code as TabBridgeErrorCode,
          message: errorData.message,
          recoverable: errorData.recoverable,
        }
        if (errorData.suggestedCommand) {
          Object.assign(error, { suggestedCommand: errorData.suggestedCommand })
        }
        return errorEnvelope(error)
      }
      return errorEnvelope({
        code: 'BROWSER_COMMAND_TIMEOUT',
        message: 'Unexpected response from content script.',
        recoverable: true,
      })
    } catch {
      return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    }
  }

  if (request.command === 'text') {
    const payload = request.payload as { tabId: number; maxBytes?: number }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Text read messaging is not available.', recoverable: false })
    }
    try {
      const result = await context.sendMessageToTab(payload.tabId, {
        type: 'tabbridge.text',
        tabId: payload.tabId,
        maxBytes: payload.maxBytes,
      })
      if (result && typeof result === 'object' && 'ok' in result && result.ok === true && 'data' in result) {
        return okEnvelope(result.data)
      }
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false && 'error' in result) {
        const errorData = result.error as { code: string; message: string; recoverable: boolean; suggestedCommand?: string }
        const error = {
          code: errorData.code as TabBridgeErrorCode,
          message: errorData.message,
          recoverable: errorData.recoverable,
        }
        if (errorData.suggestedCommand) {
          Object.assign(error, { suggestedCommand: errorData.suggestedCommand })
        }
        return errorEnvelope(error)
      }
      return errorEnvelope({
        code: 'BROWSER_COMMAND_TIMEOUT',
        message: 'Unexpected response from content script.',
        recoverable: true,
      })
    } catch {
      return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    }
  }

  if (request.command === 'html') {
    const payload = request.payload as { tabId: number; snapshotId: string; ref: string; frameRef?: string; maxBytes?: number }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'HTML read messaging is not available.', recoverable: false })
    }
    try {
      const result = await context.sendMessageToTab(payload.tabId, {
        type: 'tabbridge.html',
        tabId: payload.tabId,
        snapshotId: payload.snapshotId,
        ref: payload.ref,
        frameRef: payload.frameRef,
        maxBytes: payload.maxBytes,
      })
      if (result && typeof result === 'object' && 'ok' in result && result.ok === true && 'data' in result) {
        return okEnvelope(result.data)
      }
      if (result && typeof result === 'object' && 'ok' in result && result.ok === false && 'error' in result) {
        const errorData = result.error as { code: string; message: string; recoverable: boolean; suggestedCommand?: string }
        const error = {
          code: errorData.code as TabBridgeErrorCode,
          message: errorData.message,
          recoverable: errorData.recoverable,
        }
        if (errorData.suggestedCommand) {
          Object.assign(error, { suggestedCommand: errorData.suggestedCommand })
        }
        return errorEnvelope(error)
      }
      return errorEnvelope({
        code: 'BROWSER_COMMAND_TIMEOUT',
        message: 'Unexpected response from content script.',
        recoverable: true,
      })
    } catch {
      return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    }
  }

  if (request.command === 'screenshot') {
    const payload = request.payload as { tabId: number }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Screenshot messaging is not available.', recoverable: false })
    }
    try {
      const tab = await context.currentTab()
      if (!tab || typeof tab !== 'object' || !('id' in tab)) {
        return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'No focused normal Chrome window has an active tab.', recoverable: true })
      }
      const chromeTab = tab as { id?: number; windowId?: number; active?: boolean }
      if (chromeTab.id !== payload.tabId) {
        return errorEnvelope({
          code: 'TAB_NOT_ACTIVE_FOR_SCREENSHOT',
          message: 'Screenshot is only supported for the current active tab in the selected window.',
          recoverable: true,
          suggestedCommand: `Activate the target tab in Chrome, then retry tabbridge screenshot --tab ${payload.tabId} --json.`,
        })
      }
      const result = await screenshotController.capture(
        { tabId: payload.tabId, windowId: chromeTab.windowId ?? 0, active: Boolean(chromeTab.active) },
        async (windowId) => {
          const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
          return dataUrl
        },
      )
      return result
    } catch {
      return errorEnvelope(tabNotAuthorizedError(payload.tabId))
    }
  }

  if (request.command === 'wait') {
    const payload = request.payload as { tabId: number; ms: number }
    return actionQueue.run(payload.tabId, async () => okEnvelope(await waitMs(payload.ms)))
  }

  if (request.command === 'waitForText') {
    const payload = request.payload as { tabId: number; text: string; timeoutMs?: number }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'BROWSER_COMMAND_TIMEOUT', message: 'Cannot wait for text without an extension command context.', recoverable: true })
    }
    return actionQueue.run(payload.tabId, async () => okEnvelope(await context.sendMessageToTab!(payload.tabId, {
      type: 'tabbridge.waitForText',
      text: payload.text,
      timeoutMs: payload.timeoutMs ?? 30_000,
    })))
  }

  if (request.command === 'navigation.reload' || request.command === 'navigation.back' || request.command === 'navigation.forward') {
    const payload = request.payload as { tabId: number }
    if (!context?.sendMessageToTab) {
      return errorEnvelope({ code: 'BROWSER_COMMAND_TIMEOUT', message: 'Cannot run navigation without an extension command context.', recoverable: true })
    }
    return actionQueue.run(payload.tabId, async () => {
      if (request.command === 'navigation.reload' && context.reloadTab) await context.reloadTab(payload.tabId)
      if (request.command === 'navigation.back' && context.goBack) await context.goBack(payload.tabId)
      if (request.command === 'navigation.forward' && context.goForward) await context.goForward(payload.tabId)
      await context.sendMessageToTab!(payload.tabId, { type: 'tabbridge.clearRefs', tabId: payload.tabId })
      return okEnvelope({ navigated: true, refsCleared: true })
    })
  }

  if (request.command === 'tabs.requestAccess') {
    const payload = request.payload as { tabId: number; reason: string }
    if (!context?.getTab) {
      return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Tab lookup is not available.', recoverable: false })
    }
    const tab = await context.getTab(payload.tabId)
    if (!tab || !tab.url) {
      return errorEnvelope({ code: 'TAB_NOT_FOUND', message: 'Tab not found or has no URL.', recoverable: true })
    }
    try {
      const origin = originFromUrl(tab.url)
      const existing = getGrants().find((grant) => grant.tabId === payload.tabId && grant.origin === origin)
      if (existing && existing.expiresAt > Date.now()) {
        return okEnvelope({ granted: true, expiresAt: existing.expiresAt })
      }
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
    if (!approval) {
      return errorEnvelope({ code: 'APPROVAL_TIMEOUT', message: 'Approval not found.', recoverable: false })
    }
    return okEnvelope({ approval })
  }

  if (request.command === 'approvals.wait') {
    const payload = request.payload as { approvalId: string; timeoutMs?: number }
    const timeoutMs = payload.timeoutMs ?? 30_000
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const approval = approvalStore.get(payload.approvalId)
      if (!approval) {
        return errorEnvelope({ code: 'APPROVAL_TIMEOUT', message: 'Approval not found.', recoverable: false })
      }
      if (approval.status === 'approved') {
        return okEnvelope({ approved: true, approval })
      }
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
    if (!approval) {
      return errorEnvelope({ code: 'APPROVAL_TIMEOUT', message: 'Approval not found.', recoverable: false })
    }
    return okEnvelope({ canceled: true, approval })
  }

  const refActions = new Set(['action.click', 'action.clear', 'action.select', 'action.check', 'action.uncheck', 'action.focus'])
  if (refActions.has(request.command)) {
    const payload = request.payload as { tabId: number; snapshotId: string; ref: string; frameRef?: string; value?: string }
    return runActionOnTab(payload.tabId, context, {
      type: 'tabbridge.action',
      command: request.command.replace('action.', ''),
      tabId: payload.tabId,
      snapshotId: payload.snapshotId,
      frameRef: payload.frameRef ?? 'f0',
      ref: payload.ref,
      value: payload.value,
    })
  }

  if (request.command === 'action.type') {
    const payload = request.payload as { tabId: number; snapshotId: string; ref: string; frameRef?: string; text?: string }
    return runActionOnTab(payload.tabId, context, {
      type: 'tabbridge.action',
      command: 'type',
      tabId: payload.tabId,
      snapshotId: payload.snapshotId,
      frameRef: payload.frameRef ?? 'f0',
      ref: payload.ref,
      text: payload.text,
    })
  }

  if (request.command === 'action.press') {
    const payload = request.payload as { tabId: number; key: string }
    return runActionOnTab(payload.tabId, context, {
      type: 'tabbridge.press',
      tabId: payload.tabId,
      key: payload.key,
    })
  }

  if (request.command === 'action.scroll') {
    const payload = request.payload as { tabId: number; dx?: number; dy?: number }
    return runActionOnTab(payload.tabId, context, {
      type: 'tabbridge.scroll',
      tabId: payload.tabId,
      dx: payload.dx ?? 0,
      dy: payload.dy ?? 0,
    })
  }

  if (request.command === 'action.clickCoordinates') {
    const payload = request.payload as { tabId: number; x: number; y: number }
    const confirm = await createCoordinateActionApproval(payload.tabId, 'click-coordinates', `Click coordinates (${payload.x}, ${payload.y})`, context)
    if (confirm) return confirm
    return runActionOnTab(payload.tabId, context, {
      type: 'tabbridge.clickCoordinates',
      tabId: payload.tabId,
      x: payload.x,
      y: payload.y,
    })
  }

  if (request.command === 'action.dragCoordinates') {
    const payload = request.payload as { tabId: number; fromX: number; fromY: number; toX: number; toY: number }
    const confirm = await createCoordinateActionApproval(payload.tabId, 'drag-coordinates', `Drag coordinates from (${payload.fromX}, ${payload.fromY}) to (${payload.toX}, ${payload.toY})`, context)
    if (confirm) return confirm
    return runActionOnTab(payload.tabId, context, {
      type: 'tabbridge.dragCoordinates',
      tabId: payload.tabId,
      fromX: payload.fromX,
      fromY: payload.fromY,
      toX: payload.toX,
      toY: payload.toY,
    })
  }

  return errorEnvelope({
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Command ${request.command} is not implemented by the extension command router yet.`,
    recoverable: false,
  })
}

async function runActionOnTab(tabId: number, context: CommandContext | undefined, message: unknown): Promise<CliEnvelope<unknown>> {
  if (!context?.sendMessageToTab || !context?.getTab) {
    return errorEnvelope({ code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE', message: 'Action messaging is not available.', recoverable: false })
  }
  const tab = await context.getTab(tabId)
  if (!tab?.url || grantStatusForTab(getGrants(), { tabId, url: tab.url }, Date.now()) !== 'authorized') {
    return errorEnvelope(tabNotAuthorizedError(tabId))
  }
  try {
    const result = await context.sendMessageToTab(tabId, message)
    if (result && typeof result === 'object' && 'ok' in result && result.ok === true && 'data' in result) {
      return okEnvelope(result.data)
    }
    if (result && typeof result === 'object' && 'ok' in result && result.ok === false && 'error' in result) {
      const errorData = result.error as { code: string; message: string; recoverable: boolean; suggestedCommand?: string }
      const error = {
        code: errorData.code as TabBridgeErrorCode,
        message: errorData.message,
        recoverable: errorData.recoverable,
      }
      if (errorData.suggestedCommand) {
        Object.assign(error, { suggestedCommand: errorData.suggestedCommand })
      }
      return errorEnvelope(error)
    }
    return errorEnvelope({ code: 'BROWSER_COMMAND_TIMEOUT', message: 'Unexpected response from content script.', recoverable: true })
  } catch {
    return errorEnvelope({
      code: 'BROWSER_COMMAND_TIMEOUT',
      message: 'The extension could not communicate with the tab. Confirm the tab is still open and authorized.',
      recoverable: true,
      suggestedCommand: `tabbridge tabs request-access --tab ${tabId} --reason <reason> --json`,
    })
  }
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

// Backward-compatible wrapper for existing JSON-RPC router and tests
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
