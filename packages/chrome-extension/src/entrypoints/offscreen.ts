import { createBrokerClient, DEFAULT_BROKER_URL } from '../offscreen/broker-client'
import type { JsonRpcResponse } from '@tabbridge/shared'

const extensionId = chrome.runtime.id

const client = createBrokerClient(DEFAULT_BROKER_URL, extensionId, {
  onRequest: (request) => {
    void chrome.runtime.sendMessage({ type: 'broker.request', request })
  },
  onDisconnect: () => {
    void chrome.runtime.sendMessage({ type: 'broker.disconnected' })
  },
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false
  if (message?.type === 'broker.response' && message.response) {
    client.send(message.response as JsonRpcResponse)
    sendResponse({ ok: true })
    return true
  }
  return false
})
