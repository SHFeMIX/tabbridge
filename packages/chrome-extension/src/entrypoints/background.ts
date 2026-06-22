import { defineBackground } from 'wxt/utils/define-background'
import { createBrokerClient, DEFAULT_BROKER_URL } from '../background/broker-client'
import { routeJsonRpcRequest } from '../background/jsonrpc-router'

export default defineBackground(() => {
  createBrokerClient(DEFAULT_BROKER_URL, chrome.runtime.id, {
    onRequest: routeJsonRpcRequest,
  })
})
