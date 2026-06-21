import { defineBackground } from 'wxt/utils/define-background'
import { createNativePortManager } from '../background/native-port'
import { routeBridgeCommand } from '../background/commands'

export default defineBackground(() => {
  const manager = createNativePortManager(chrome.runtime, {
    extensionId: chrome.runtime.id,
    onMessage: routeBridgeCommand,
  })

  manager.connect()
})
