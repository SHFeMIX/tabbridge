import { errorEnvelope, okEnvelope, refStaleError, type CliEnvelope } from '@tabbridge/shared'
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

function resolveElement(selectorCandidates: string[]): Element | undefined {
  for (const selector of selectorCandidates) {
    const element = document.querySelector(selector)
    if (element) return element
  }
  return undefined
}

function visibleAndEnabled(element: Element): CliEnvelope<undefined> | undefined {
  const html = element as HTMLElement
  const style = window.getComputedStyle(html)
  if (style.display === 'none' || style.visibility === 'hidden') {
    return errorEnvelope({ code: 'ELEMENT_NOT_VISIBLE', message: 'The target element is not visible.', recoverable: true })
  }
  if ('disabled' in html && Boolean((html as HTMLButtonElement).disabled)) {
    return errorEnvelope({ code: 'ELEMENT_DISABLED', message: 'The target element is disabled.', recoverable: true })
  }
  return undefined
}

export async function executeRefAction(input: RefActionInput, store: RefStore, now: number): Promise<CliEnvelope<ActionResult>> {
  const record = store.getRecord(input.snapshotId, input.frameRef, input.ref, now)
  if (!record) return errorEnvelope(refStaleError(input.tabId))

  const element = resolveElement(record.selectorCandidates)
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
