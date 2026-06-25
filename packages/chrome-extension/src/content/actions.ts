import { errorEnvelope, okEnvelope, refStaleError, type CliEnvelope, type ElementRefRecord } from '@tabbridge/shared'
import { fingerprintElement } from './element-fingerprint'
import { findBestLiveMatch } from './identity-matcher'
import type { RefStore } from './ref-store'

export type RefActionInput = {
  command: 'click' | 'type' | 'clear' | 'select' | 'check' | 'uncheck' | 'focus'
  tabId: number
  snapshotId: string
  frameRef: string
  ref: string
  text?: string
  value?: string
}

export type ActionResult = {
  action: string
  ref: string
}

const INTERACTABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="dialog"]',
  'dialog',
  '[aria-modal="true"]',
  '[onclick]',
].join(',')

function liveCandidates(): Element[] {
  return Array.from(document.querySelectorAll(INTERACTABLE_SELECTOR))
}

export function resolveLiveElement(record: ElementRefRecord): Element | undefined {
  const candidates = liveCandidates().map((element) => ({ element, fingerprint: fingerprintElement(element) }))
  const match = findBestLiveMatch(record, candidates)
  return match.kind === 'matched' ? match.element : undefined
}

function visibleAndEnabled(element: Element): CliEnvelope<undefined> | undefined {
  const html = element as HTMLElement
  const style = window.getComputedStyle(html)
  if (style.display === 'none' || style.visibility === 'hidden' || element.hasAttribute('hidden')) {
    return errorEnvelope({ code: 'ELEMENT_NOT_VISIBLE', message: 'The target element is not visible.', recoverable: true })
  }
  if ('disabled' in html && Boolean((html as HTMLButtonElement).disabled)) {
    return errorEnvelope({ code: 'ELEMENT_DISABLED', message: 'The target element is disabled.', recoverable: true })
  }
  if (element.getAttribute('aria-disabled') === 'true') {
    return errorEnvelope({ code: 'ELEMENT_DISABLED', message: 'The target element is disabled.', recoverable: true })
  }
  return undefined
}

function recordFor(input: RefActionInput, store: RefStore, now: number): ElementRefRecord | undefined {
  return store.getLatestRecord(input.tabId, input.frameRef, input.ref, now) ?? store.getRecord(input.snapshotId, input.frameRef, input.ref, now)
}

export async function executeRefAction(input: RefActionInput, store: RefStore, now: number): Promise<CliEnvelope<ActionResult>> {
  const record = recordFor(input, store, now)
  if (!record) return errorEnvelope(refStaleError(input.tabId))

  const element = resolveLiveElement(record)
  if (!element) return errorEnvelope(refStaleError(input.tabId))

  const invalid = visibleAndEnabled(element)
  if (invalid) return invalid as CliEnvelope<ActionResult>

  if (input.command === 'click') {
    ;(element as HTMLElement).click()
  } else if (input.command === 'focus') {
    ;(element as HTMLElement).focus()
  } else if (input.command === 'clear') {
    ;(element as HTMLInputElement).value = ''
    element.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (input.command === 'type') {
    ;(element as HTMLInputElement).value = `${(element as HTMLInputElement).value ?? ''}${input.text ?? ''}`
    element.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (input.command === 'select') {
    ;(element as HTMLSelectElement).value = input.value ?? ''
    element.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (input.command === 'check') {
    ;(element as HTMLInputElement).checked = true
    element.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (input.command === 'uncheck') {
    ;(element as HTMLInputElement).checked = false
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  return okEnvelope({ action: input.command, ref: input.ref })
}
