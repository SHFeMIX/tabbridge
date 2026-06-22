import type { TabBridgeError } from './errors.js'

export const PROTOCOL_VERSION = 1 as const

export type CliEnvelope<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: TabBridgeError }

export type BridgeRequest<TPayload = Record<string, unknown>> = {
  id: string
  protocolVersion: typeof PROTOCOL_VERSION
  source: 'cli' | 'extension'
  target: 'cli' | 'extension'
  command: string
  payload: TPayload
  createdAt: number
}

export type BridgeResponse<TPayload = unknown> =
  | { id: string; protocolVersion: typeof PROTOCOL_VERSION; ok: true; payload: TPayload }
  | { id: string; protocolVersion: typeof PROTOCOL_VERSION; ok: false; error: TabBridgeError }

export function createBridgeRequest<TPayload = Record<string, unknown>>(input: Omit<BridgeRequest<TPayload>, 'protocolVersion'>): BridgeRequest<TPayload> {
  return { protocolVersion: PROTOCOL_VERSION, ...input }
}

export type BridgeHello = {
  type: 'hello'
  protocolVersion: typeof PROTOCOL_VERSION
  role: 'native-host' | 'extension' | 'cli'
  version: string
  extensionId?: string
  capabilities: {
    commands: string[]
    snapshot: Array<'semantic' | 'text' | 'html' | 'screenshot'>
    permissions: string[]
  }
}

export type BrokerHelloParams = {
  protocolVersion: typeof PROTOCOL_VERSION
  version: string
  extensionId?: string
  capabilities: {
    commands: string[]
    snapshot: Array<'semantic' | 'text' | 'html' | 'screenshot'>
    permissions: Array<'tabs' | 'host-permission' | 'activeTab' | 'scripting' | 'storage'>
  }
}

export function okEnvelope<TData>(data: TData): CliEnvelope<TData> {
  return { ok: true, data }
}

export function errorEnvelope(error: TabBridgeError): CliEnvelope<never> {
  return { ok: false, error }
}
