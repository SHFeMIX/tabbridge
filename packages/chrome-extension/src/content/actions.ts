import { errorEnvelope, okEnvelope, refStaleError, snapshotRequiredError, type CliEnvelope, type ElementRefRecord } from '@tabbridge/shared'
import { fingerprintElement } from './element-fingerprint'
import { findBestLiveMatch } from './identity-matcher'
import type { RefStore } from './ref-store'

export type RefActionInput = {
  command: 'click' | 'type' | 'fill' | 'clear' | 'select' | 'check' | 'uncheck' | 'focus'
  tabId: number
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

export function resolveLiveElement(record: ElementRefRecord): { element?: Element; reason?: string; bestScore?: number } {
  const candidates = liveCandidates().map((element) => ({ element, fingerprint: fingerprintElement(element) }))
  const match = findBestLiveMatch(record, candidates)
  if (match.kind === 'matched') return { element: match.element, reason: match.reason, bestScore: match.score }
  return { reason: match.reason, bestScore: match.score }
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

function updateValue(element: Element, value: string): void {
  ;(element as HTMLInputElement).value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function dispatchClickSequence(element: Element): void {
  const html = element as HTMLElement
  const rect = html.getBoundingClientRect()
  const clientX = rect.left + rect.width / 2
  const clientY = rect.top + rect.height / 2
  const init = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
  }
  const supportsPointer = typeof PointerEvent !== 'undefined'
  if (supportsPointer) {
    html.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }))
  }
  html.dispatchEvent(new MouseEvent('mousedown', init))
  if (supportsPointer) {
    html.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }))
  }
  html.dispatchEvent(new MouseEvent('mouseup', init))
  html.click()
}

export async function executeRefAction(input: RefActionInput, store: RefStore, now: number): Promise<CliEnvelope<ActionResult>> {
  if (!store.hasLatestSnapshot(input.tabId, now)) return errorEnvelope(snapshotRequiredError())

  const record = store.getLatestRecord(input.tabId, input.frameRef, input.ref, now)
  if (!record) return errorEnvelope(refStaleError(input.tabId, input.ref))

  const resolution = resolveLiveElement(record)
  if (!resolution.element) {
    const detail = resolution.reason ? ` (${resolution.reason}, bestScore=${resolution.bestScore ?? 0})` : ''
    return errorEnvelope({
      ...refStaleError(input.tabId, input.ref),
      message: `Ref ${input.ref} is not available in the latest snapshot. Run tabbridge snapshot -i again.${detail}`,
    })
  }

  const invalid = visibleAndEnabled(resolution.element)
  if (invalid) return invalid as CliEnvelope<ActionResult>

  if (input.command === 'click') {
    dispatchClickSequence(resolution.element)
  } else if (input.command === 'focus') {
    ;(resolution.element as HTMLElement).focus()
  } else if (input.command === 'clear') {
    updateValue(resolution.element, '')
  } else if (input.command === 'fill') {
    updateValue(resolution.element, input.text ?? '')
  } else if (input.command === 'type') {
    updateValue(resolution.element, `${(resolution.element as HTMLInputElement).value ?? ''}${input.text ?? ''}`)
  } else if (input.command === 'select') {
    ;(resolution.element as HTMLSelectElement).value = input.value ?? ''
    resolution.element.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (input.command === 'check') {
    ;(resolution.element as HTMLInputElement).checked = true
    resolution.element.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (input.command === 'uncheck') {
    ;(resolution.element as HTMLInputElement).checked = false
    resolution.element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  return okEnvelope({ action: input.command, ref: input.ref })
}
