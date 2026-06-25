import type { ElementState, Rect } from '@tabbridge/shared'
import { computeAccessibleName } from './accessible-name'
import { computeElementState } from './element-state'
import { normalizeRole } from './role-normalizer'
import { createIdentityHash, type IdentityInput } from './stable-ref'

export type ElementFingerprint = {
  identityHash: string
  role: string
  accessibleName: string
  textFingerprint: string
  domSignature: string
  keyAttributes: Record<string, string>
  formContext?: string
  boundingBox: Rect
  states: ElementState
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function rectFor(element: Element): Rect {
  const rect = element.getBoundingClientRect()
  return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)]
}

function signatureSegment(element: Element): string {
  const tag = element.tagName.toLowerCase()
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase()
    return `input[type=${type}]`
  }
  return tag
}

function domSignature(element: Element): string {
  const segments: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && current !== document.documentElement) {
    segments.unshift(signatureSegment(current))
    current = current.parentElement
  }
  return segments.join('/')
}

function pathOnly(value: string): string {
  try {
    return new URL(value, window.location.href).pathname
  } catch {
    return value.split('?')[0]?.split('#')[0] ?? value
  }
}

function keyAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const name of ['type', 'name', 'autocomplete', 'aria-controls', 'aria-expanded', 'id']) {
    const value = normalizeText(element.getAttribute(name) ?? '')
    if (value) attributes[name] = value
  }
  if (element instanceof HTMLAnchorElement) {
    const href = normalizeText(element.getAttribute('href') ?? '')
    if (href) attributes.href = pathOnly(href)
  }
  return attributes
}

function formContext(element: Element): string | undefined {
  const form = element.closest('form')
  if (!form) return undefined
  const name = computeAccessibleName(form)
  if (name && name !== 'form') return name
  const id = normalizeText(form.getAttribute('id') ?? '')
  if (id) return id
  const action = normalizeText(form.getAttribute('action') ?? '')
  return action ? pathOnly(action) : undefined
}

function textFingerprintFor(element: Element, accessibleName: string): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return accessibleName
  return normalizeText(element.textContent ?? '').slice(0, 160) || accessibleName
}

export function fingerprintElement(element: Element): ElementFingerprint {
  const role = normalizeRole(element)
  const accessibleName = computeAccessibleName(element)
  const dom = domSignature(element)
  const attrs = keyAttributes(element)
  const context = formContext(element)
  const identityInput: IdentityInput = { role, accessibleName, domSignature: dom, keyAttributes: attrs }
  if (context) identityInput.formContext = context
  const identityHash = createIdentityHash(identityInput)
  const fingerprint: ElementFingerprint = {
    identityHash,
    role,
    accessibleName,
    textFingerprint: textFingerprintFor(element, accessibleName),
    domSignature: dom,
    keyAttributes: attrs,
    boundingBox: rectFor(element),
    states: computeElementState(element),
  }
  if (context) fingerprint.formContext = context
  return fingerprint
}
