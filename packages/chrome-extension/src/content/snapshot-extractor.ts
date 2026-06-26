import { displayRef, formatAgentSnapshotText, type AgentInteractiveSnapshot, type AgentSnapshotRef, type ElementRefRecord, type Rect } from '@tabbridge/shared'
import { computeElementState } from './element-state'
import { fingerprintElement } from './element-fingerprint'

export type ExtractSnapshotInput = {
  tabId: number
  snapshotId?: string
  title: string
  url: string
  includeUrl?: boolean
  now: number
}

export type ExtractSnapshotResult = {
  snapshot: AgentInteractiveSnapshot
  records: ElementRefRecord[]
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

function isVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement
  const style = window.getComputedStyle(htmlElement)
  const rect = htmlElement.getBoundingClientRect()
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 0 && rect.height >= 0
}

function rectFor(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)]
}

function textFor(element: Element, accessibleName: string): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return ''
  return element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) || accessibleName
}

function pathOnly(value: string): string {
  try {
    return new URL(value, window.location.href).pathname
  } catch {
    return value.split('?')[0]?.split('#')[0] ?? value
  }
}

function attributesFor(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {}
  const type = element.getAttribute('type')
  const placeholder = element.getAttribute('placeholder')
  const ariaLabel = element.getAttribute('aria-label')
  const href = element.getAttribute('href')
  if (type) attributes.type = type
  if (placeholder) attributes.placeholder = placeholder
  if (ariaLabel) attributes['aria-label'] = ariaLabel
  if (href) attributes.href = pathOnly(href)
  return attributes
}

export function extractSnapshotFromDocument(input: ExtractSnapshotInput): ExtractSnapshotResult {
  const elements = Array.from(document.querySelectorAll(INTERACTABLE_SELECTOR)).filter(isVisible)
  const records: ElementRefRecord[] = []
  const refs: AgentSnapshotRef[] = []

  elements.forEach((element, index) => {
    const fingerprint = fingerprintElement(element)
    const ref = displayRef(`e${index + 1}`)
    const text = textFor(element, fingerprint.accessibleName)
    const states = computeElementState(element)
    const box = rectFor(element)

    refs.push({
      ref,
      role: fingerprint.role,
      name: fingerprint.accessibleName,
      text,
      attributes: attributesFor(element),
    })

    const record: ElementRefRecord = {
      snapshotId: input.snapshotId ?? `latest_${input.now}`,
      tabId: input.tabId,
      frameRef: 'f0',
      ref,
      identityHash: fingerprint.identityHash,
      role: fingerprint.role,
      accessibleName: fingerprint.accessibleName,
      name: fingerprint.accessibleName,
      textFingerprint: fingerprint.textFingerprint,
      domSignature: fingerprint.domSignature,
      keyAttributes: fingerprint.keyAttributes,
      states,
      boundingBox: box,
      selectorCandidates: [],
      xpathCandidates: [],
      generatedAt: input.now,
    }
    if (fingerprint.formContext) record.formContext = fingerprint.formContext
    records.push(record)
  })

  const snapshot: AgentInteractiveSnapshot = {
    page: { title: input.title, url: input.url },
    refs,
  }
  snapshot.text = formatAgentSnapshotText(snapshot)

  return { snapshot, records }
}
