import type { TabBridgeError } from './errors.js'

export const PROTOCOL_VERSION = 1 as const

export type CliEnvelope<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: TabBridgeError }

export type BridgeRequest = {
  id: string
  protocolVersion: typeof PROTOCOL_VERSION
  source: 'cli' | 'native-host' | 'extension'
  target: 'native-host' | 'extension'
  command: string
  payload: unknown
  createdAt: number
}

export type BridgeResponse = {
  id: string
  protocolVersion: typeof PROTOCOL_VERSION
  ok: boolean
  payload?: unknown
  error?: TabBridgeError
}

export type BridgeHello = {
  type: 'hello'
  protocolVersion: typeof PROTOCOL_VERSION
  role: 'extension' | 'native-host'
  version: string
  extensionId?: string
  capabilities: {
    commands: string[]
    snapshot: Array<'semantic' | 'text' | 'html' | 'screenshot'>
    permissions: Array<'tabs' | 'host-permission' | 'activeTab' | 'nativeMessaging' | 'scripting' | 'storage'>
  }
}

export function okEnvelope<TData>(data: TData): CliEnvelope<TData> {
  return { ok: true, data }
}

export function errorEnvelope(error: TabBridgeError): CliEnvelope<never> {
  return { ok: false, error }
}

export function createBridgeRequest(input: Omit<BridgeRequest, 'protocolVersion'>): BridgeRequest {
  return { ...input, protocolVersion: PROTOCOL_VERSION }
}
