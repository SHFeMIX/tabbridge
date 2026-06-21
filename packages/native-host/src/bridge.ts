import {
  PROTOCOL_VERSION,
  bridgeNotConnectedError,
  errorEnvelope,
  okEnvelope,
  type BridgeHello,
  type BridgeRequest,
  type BridgeResponse,
  type CliEnvelope,
  type TabBridgeError,
} from '@tabbridge/shared'
import { TabActionQueue } from './action-queue.js'

export type BridgeState = 'extension_asleep' | 'connected'

export type BridgeStatus = {
  connected: boolean
  state: BridgeState
  extensionId?: string
  version?: string
}

export type BridgeControllerOptions = {
  requestTimeoutMs: number
}

type PendingRequest = {
  resolve: (response: BridgeResponse) => void
  timer: NodeJS.Timeout
}

function timeoutError(): TabBridgeError {
  return {
    code: 'BRIDGE_REQUEST_TIMEOUT',
    message: 'Timed out waiting for the TabBridge extension response.',
    recoverable: true,
    suggestedCommand: 'tabbridge status --json',
  }
}

function malformedHello(field: string): Error {
  return new Error(`MALFORMED_EXTENSION_HELLO: ${field}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validateExtensionHello(value: unknown): BridgeHello {
  if (!isRecord(value)) throw malformedHello('hello')
  if (value.type !== 'hello') throw malformedHello('type')
  if (value.protocolVersion !== PROTOCOL_VERSION) throw new Error('PROTOCOL_VERSION_MISMATCH')
  if (value.role !== 'extension') throw malformedHello('role')
  if (typeof value.version !== 'string' || value.version.length === 0) throw malformedHello('version')

  const capabilities = value.capabilities
  if (!isRecord(capabilities)) throw malformedHello('capabilities')
  if (!Array.isArray(capabilities.commands)) throw malformedHello('capabilities.commands')
  if (!Array.isArray(capabilities.snapshot)) throw malformedHello('capabilities.snapshot')
  if (!Array.isArray(capabilities.permissions)) throw malformedHello('capabilities.permissions')
  if (value.extensionId !== undefined && typeof value.extensionId !== 'string') throw malformedHello('extensionId')

  return value as BridgeHello
}

function duplicateRequestIdError(id: string): TabBridgeError {
  return {
    code: 'DUPLICATE_BRIDGE_REQUEST_ID',
    message: `A bridge request with id ${id} is already in flight.`,
    recoverable: false,
  }
}

export class BridgeController {
  private extensionHello: BridgeHello | undefined
  private readonly pending = new Map<string, PendingRequest>()
  private readonly actionQueue = new TabActionQueue()

  constructor(private readonly options: BridgeControllerOptions) {}

  status(): BridgeStatus {
    if (!this.extensionHello) return { connected: false, state: 'extension_asleep' }

    const status: BridgeStatus = {
      connected: true,
      state: 'connected',
      version: this.extensionHello.version,
    }
    if (this.extensionHello.extensionId !== undefined) status.extensionId = this.extensionHello.extensionId
    return status
  }

  acceptHello(hello: unknown): void {
    this.extensionHello = validateExtensionHello(hello)
  }

  disconnect(): void {
    this.extensionHello = undefined
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve({ id, protocolVersion: PROTOCOL_VERSION, ok: false, error: bridgeNotConnectedError('extension_asleep') })
    }
    this.pending.clear()
  }

  async forward(request: BridgeRequest, sendToExtension: (request: BridgeRequest) => void | Promise<void>): Promise<CliEnvelope<unknown>> {
    const tabId = actionTabId(request)
    if (tabId === undefined) return await this.forwardNow(request, sendToExtension)
    return await this.actionQueue.run(tabId, () => this.forwardNow(request, sendToExtension))
  }

  private async forwardNow(request: BridgeRequest, sendToExtension: (request: BridgeRequest) => void | Promise<void>): Promise<CliEnvelope<unknown>> {
    if (!this.extensionHello) return errorEnvelope(bridgeNotConnectedError('extension_asleep'))
    if (this.pending.has(request.id)) return errorEnvelope(duplicateRequestIdError(request.id))

    const response = await new Promise<BridgeResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id)
        resolve({ id: request.id, protocolVersion: PROTOCOL_VERSION, ok: false, error: timeoutError() })
      }, this.options.requestTimeoutMs)

      this.pending.set(request.id, { resolve, timer })

      Promise.resolve(sendToExtension(request)).catch(() => {
        if (this.pending.get(request.id)?.timer !== timer) return
        clearTimeout(timer)
        this.pending.delete(request.id)
        resolve({ id: request.id, protocolVersion: PROTOCOL_VERSION, ok: false, error: bridgeNotConnectedError('extension_asleep') })
      })
    })

    if (response.protocolVersion !== PROTOCOL_VERSION) {
      return errorEnvelope({
        code: 'PROTOCOL_VERSION_MISMATCH',
        message: `Extension response protocolVersion ${String(response.protocolVersion)} did not match native host protocolVersion ${PROTOCOL_VERSION}.`,
        recoverable: true,
        suggestedCommand: 'tabbridge status --json',
      })
    }

    if (response.ok) return okEnvelope(response.payload)
    return errorEnvelope(response.error)
  }

  acceptResponse(response: BridgeResponse): boolean {
    const pending = this.pending.get(response.id)
    if (!pending) return false

    clearTimeout(pending.timer)
    this.pending.delete(response.id)
    pending.resolve(response)
    return true
  }
}

function actionTabId(request: BridgeRequest): number | undefined {
  if (!request.command.startsWith('action.')) return undefined
  if (typeof request.payload !== 'object' || request.payload === null) return undefined
  const tabId = (request.payload as { tabId?: unknown }).tabId
  return typeof tabId === 'number' ? tabId : undefined
}
