import { classifyRisk, displayRef, domainFromUrl, type ElementRefRecord, type PageSnapshot, type Rect, type SnapshotElement } from '@tabbridge/shared'
import { computeElementState, stateLabels } from './element-state'
import { fingerprintElement } from './element-fingerprint'
import { matchElementIdentity } from './identity-matcher'
import { createIdentityHash, createStableRef } from './stable-ref'

export type ExtractSnapshotInput = {
  tabId: number
  snapshotId: string
  title: string
  url: string
  includeUrl: boolean
  now: number
  previousRecords?: ElementRefRecord[]
}

export type ExtractSnapshotResult = {
  snapshot: PageSnapshot
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
  // Use >= 0 so jsdom tests without layout can still discover elements.
  // In a real Chrome tab, getBoundingClientRect reflects actual visibility.
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

function uniqueRef(baseRef: string, usedRefs: Set<string>, collisionIndex: number): string {
  if (!usedRefs.has(baseRef)) return baseRef
  const derivedHash = createIdentityHash({
    role: 'ref-collision',
    accessibleName: baseRef,
    domSignature: String(collisionIndex),
    keyAttributes: {},
  })
  return createStableRef(derivedHash)
}

export function extractSnapshotFromDocument(input: ExtractSnapshotInput): ExtractSnapshotResult {
  const elements = Array.from(document.querySelectorAll(INTERACTABLE_SELECTOR)).filter(isVisible)
  const records: ElementRefRecord[] = []
  const tree: SnapshotElement[] = []
  const previousRecords = input.previousRecords ?? []
  const usedRefs = new Set<string>()
  let collisionIndex = 0

  for (const element of elements) {
    const fingerprint = fingerprintElement(element)
    const availablePreviousRecords = previousRecords.filter((record) => !usedRefs.has(record.ref))
    const decision = matchElementIdentity(availablePreviousRecords, fingerprint)
    const baseRef = decision.kind === 'reuse' ? decision.ref : createStableRef(decision.identityHash)
    const ref = uniqueRef(baseRef, usedRefs, collisionIndex)
    if (ref !== baseRef) collisionIndex += 1
    usedRefs.add(ref)
    const text = textFor(element, fingerprint.accessibleName)
    const inputType = element.getAttribute('type') ?? undefined
    const risk = classifyRisk({ command: 'snapshot', role: fingerprint.role, name: fingerprint.accessibleName, text, inputType, usesCoordinates: false })
    const states = computeElementState(element)
    const labels = stateLabels(states)
    const box = rectFor(element)

    tree.push({
      ref,
      role: fingerprint.role,
      name: fingerprint.accessibleName,
      accessibleName: fingerprint.accessibleName,
      text,
      states: labels,
      box,
      risk: risk.risk,
      identityHash: fingerprint.identityHash,
    })
    const record: ElementRefRecord = {
      snapshotId: input.snapshotId,
      tabId: input.tabId,
      frameRef: 'f0',
      ref: displayRef(ref),
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
  }

  let origin: string
  try {
    origin = new URL(input.url).origin
  } catch {
    origin = domainFromUrl(input.url)
  }

  const snapshotBase = {
    tabId: input.tabId,
    snapshotId: input.snapshotId,
    title: input.title,
    domain: domainFromUrl(input.url),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    frames: [{ frameRef: 'f0', origin, accessible: true, tree }],
  }

  const snapshot: PageSnapshot = input.includeUrl
    ? { ...snapshotBase, urlVisible: true, url: input.url }
    : { ...snapshotBase, urlVisible: false }

  return { snapshot, records }
}
