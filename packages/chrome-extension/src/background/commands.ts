import { type TabBridgeError } from '@tabbridge/shared'

export async function routeBridgeMethod(method: string, _params: unknown): Promise<unknown> {
  if (method === 'status') {
    return { bridge: 'connected' }
  }

  const error: TabBridgeError = {
    code: 'ACTION_NOT_SUPPORTED_IN_EXTENSION_MODE',
    message: `Method ${method} is not implemented by the extension command router yet.`,
    recoverable: false,
  }
  throw error
}
