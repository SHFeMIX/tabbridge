import {
  ERROR_CODES,
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

type InFlightRequest = PendingRequest | 'reserved'

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
    code: 'PROTOCOL_VERSION_MISMATCH',
    message: `A bridge request with id ${id} is already in flight.`,
    recoverable: false,
  }
}

function malformedResponseError(id: string, field: string): BridgeResponse {
  return {
    id,
    protocolVersion: PROTOCOL_VERSION,
    ok: false,
    error: {
      code: 'PROTOCOL_VERSION_MISMATCH',
      message: `Extension response did not match the native host bridge protocol: ${field}.`,
      recoverable: true,
      suggestedCommand: 'tabbridge status --json',
    },
  }
}

function isTabBridgeError(value: unknown): value is TabBridgeError {
  if (!isRecord(value)) return false
  return typeof value.code === 'string'
    && ERROR_CODES.includes(value.code as never)
    && typeof value.message === 'string'
    && typeof value.recoverable === 'boolean'
    && (value.suggestedCommand === undefined || typeof value.suggestedCommand === 'string')
    && (value.approvalId === undefined || typeof value.approvalId === 'string')
    && (value.pollCommand === undefined || typeof value.pollCommand === 'string')
    && (value.expiresAt === undefined || typeof value.expiresAt === 'number')
}

function validateExtensionResponse(response: unknown, expectedId: string): BridgeResponse {
  if (!isRecord(response)) return malformedResponseError(expectedId, 'response')
  if (response.id !== expectedId) return malformedResponseError(expectedId, 'id')
  if (response.protocolVersion !== PROTOCOL_VERSION) return malformedResponseError(expectedId, 'protocolVersion')
  if (typeof response.ok !== 'boolean') return malformedResponseError(expectedId, 'ok')
  if (response.ok) {
    if (Object.hasOwn(response, 'error')) return malformedResponseError(expectedId, 'error')
    if (!Object.hasOwn(response, 'payload')) return malformedResponseError(expectedId, 'payload')
    return { id: expectedId, protocolVersion: PROTOCOL_VERSION, ok: true, payload: response.payload }
  }
  if (Object.hasOwn(response, 'payload')) return malformedResponseError(expectedId, 'payload')
  if (!isTabBridgeError(response.error)) return malformedResponseError(expectedId, 'error')
  return { id: expectedId, protocolVersion: PROTOCOL_VERSION, ok: false, error: response.error }
}

export class BridgeController {
  private extensionHello: BridgeHello | undefined
  private readonly pending = new Map<string, InFlightRequest>()
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
      if (pending === 'reserved') continue
      clearTimeout(pending.timer)
      pending.resolve({ id, protocolVersion: PROTOCOL_VERSION, ok: false, error: bridgeNotConnectedError('extension_asleep') })
    }
    this.pending.clear()
  }

  async forward(request: BridgeRequest, sendToExtension: (request: BridgeRequest) => void | Promise<void>): Promise<CliEnvelope<unknown>> {
    if (this.pending.has(request.id)) return errorEnvelope(duplicateRequestIdError(request.id))
    this.pending.set(request.id, 'reserved')
    const tabId = actionTabId(request)
    try {
      if (tabId === undefined) return await this.forwardNow(request, sendToExtension)
      return await this.actionQueue.run(tabId, () => this.forwardNow(request, sendToExtension))
    } finally {
      if (this.pending.get(request.id) === 'reserved') this.pending.delete(request.id)
    }
  }

  private async forwardNow(request: BridgeRequest, sendToExtension: (request: BridgeRequest) => void | Promise<void>): Promise<CliEnvelope<unknown>> {
    if (!this.extensionHello) return errorEnvelope(bridgeNotConnectedError('extension_asleep'))

    const response = await new Promise<BridgeResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id)
        resolve({ id: request.id, protocolVersion: PROTOCOL_VERSION, ok: false, error: timeoutError() })
      }, this.options.requestTimeoutMs)

      const pending: PendingRequest = { resolve, timer }
      this.pending.set(request.id, pending)

      const failSend = (): void => {
        if (this.pending.get(request.id) !== pending) return
        clearTimeout(timer)
        this.pending.delete(request.id)
        resolve({ id: request.id, protocolVersion: PROTOCOL_VERSION, ok: false, error: bridgeNotConnectedError('extension_asleep') })
      }

      try {
        Promise.resolve(sendToExtension(request)).catch(failSend)
      } catch {
        failSend()
      }
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

  acceptResponse(response: unknown): boolean {
    if (!isRecord(response) || typeof response.id !== 'string') return false
    const pending = this.pending.get(response.id)
    if (!pending || pending === 'reserved') return false

    clearTimeout(pending.timer)
    this.pending.delete(response.id)
    pending.resolve(validateExtensionResponse(response, response.id))
    return true
  }
}

function actionTabId(request: BridgeRequest): number | undefined {
  if (!request.command.startsWith('action.')) return undefined
  if (typeof request.payload !== 'object' || request.payload === null) return undefined
  const tabId = (request.payload as { tabId?: unknown }).tabId
  return typeof tabId === 'number' ? tabId : undefined
}
