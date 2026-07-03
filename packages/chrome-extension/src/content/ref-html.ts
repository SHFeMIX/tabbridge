import type { BoundedReadResult } from './bounded-read'
import { sanitizeElementHtml } from './bounded-read'
import { resolveLiveElement } from './actions'
import type { ElementRefRecord } from '@tabbridge/shared'

export function readRefHtml(record: ElementRefRecord, maxBytes: number): BoundedReadResult | undefined {
  const resolution = resolveLiveElement(record)
  return resolution.element ? sanitizeElementHtml(resolution.element, maxBytes) : undefined
}
