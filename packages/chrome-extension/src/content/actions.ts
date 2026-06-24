import { refStaleError, type ElementRefRecord } from '@tabbridge/shared'
import type { RefStore } from './ref-store'

export async function executeRefAction(
  _params: {
    command: string
    tabId: number
    snapshotId: string
    frameRef: string
    ref: string
    text?: string
    value?: string
  },
  _refStore: RefStore,
  _now: number,
): Promise<unknown> {
  return { ok: false, error: refStaleError(_params.tabId) }
}
