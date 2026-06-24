import { createSiteGrant } from '@tabbridge/shared'
import { defineBackground } from 'wxt/utils/define-background'
import type { JsonRpcRequest, JsonRpcResponse } from '@tabbridge/shared'
import { approvalStore } from '../background/approvals'
import { addGrant } from '../background/grants'
import { routeJsonRpcRequest } from '../background/jsonrpc-router'

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html'
const KEEPALIVE_ALARM_NAME = 'tabbridge-keepalive'
const KEEPALIVE_INTERVAL_MINUTES = 1

export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH),
    reasons: ['WORKERS'],
    justification: 'Maintain persistent WebSocket connection to the TabBridge broker',
  })
}

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
  })
  return contexts.length > 0
}

async function handleBrokerRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  return await routeJsonRpcRequest(request)
}

function isPopupMessage(message: unknown): message is { type: 'tabbridge.popup.listApprovals' } | { type: 'tabbridge.popup.decideApproval'; id: string; decision?: 'approve' | 'deny' } {
  const record = message as { type?: string }
  return record.type === 'tabbridge.popup.listApprovals' || record.type === 'tabbridge.popup.decideApproval'
}

async function handlePopupMessage(message: unknown): Promise<unknown> {
  const record = message as { type?: string; id?: string; decision?: 'approve' | 'deny' }
  if (record.type === 'tabbridge.popup.listApprovals') {
    return { ok: true, data: { approvals: approvalStore.listPending() } }
  }
  if (record.type === 'tabbridge.popup.decideApproval' && typeof record.id === 'string') {
    const transitionType = record.decision === 'approve' ? 'approve' : 'deny'
    const approval = approvalStore.transition(record.id, transitionType)
    if (approval && approval.status === 'approved' && approval.kind === 'site-access') {
      const siteAccess = approval as { tabId?: number; origin?: string }
      if (typeof siteAccess.tabId === 'number' && typeof siteAccess.origin === 'string') {
        addGrant(createSiteGrant({ tabId: siteAccess.tabId, origin: siteAccess.origin, grantedByUserAt: Date.now() }))
      }
    }
    return { ok: true, data: { approvals: approvalStore.listPending() } }
  }
  return undefined
}

export default defineBackground(() => {
  void ensureOffscreenDocument()

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isPopupMessage(message)) {
      void handlePopupMessage(message).then((response) => sendResponse(response))
      return true
    }

    if (message?.type === 'broker.response') {
      sendResponse({ ok: true })
      return true
    }
    if (message?.type === 'broker.disconnected') {
      void ensureOffscreenDocument()
      sendResponse({ ok: true })
      return true
    }
    if (message?.type === 'broker.request' && message.request) {
      void handleBrokerRequest(message.request as JsonRpcRequest)
        .then((response) => {
          void chrome.runtime.sendMessage({ type: 'broker.response', response })
        })
        .finally(() => sendResponse({ ok: true }))
      return true
    }
    return false
  })

  chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: KEEPALIVE_INTERVAL_MINUTES })
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== KEEPALIVE_ALARM_NAME) return
    void chrome.storage.local.set({ lastKeepAlive: Date.now() })
    void ensureOffscreenDocument()
  })
})
