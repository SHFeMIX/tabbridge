import {
  PROTOCOL_VERSION,
  type BridgeRequest,
  type BridgeResponse,
  type TabBridgeError,
} from '@tabbridge/shared'

export async function routeBridgeCommand(request: BridgeRequest): Promise<BridgeResponse> {
  if (request.command === 'status') {
    return {
      id: request.id,
      protocolVersion: PROTOCOL_VERSION,
      ok: true,
      payload: { bridge: 'connected' },
    }
  }

  const error: TabBridgeError = {
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Command ${request.command} is not implemented by the extension command router yet.`,
    recoverable: false,
  }

  return {
    id: request.id,
    protocolVersion: PROTOCOL_VERSION,
    ok: false,
    error,
  }
}
