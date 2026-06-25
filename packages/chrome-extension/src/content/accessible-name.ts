import { normalizeRole } from './role-normalizer'

const MAX_ACCESSIBLE_NAME_LENGTH = 120

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string): string {
  return value.length > MAX_ACCESSIBLE_NAME_LENGTH ? value.slice(0, MAX_ACCESSIBLE_NAME_LENGTH).trim() : value
}

function fallbackRole(element: Element): string {
  return normalizeRole(element)
}

function textName(element: Element): string {
  if (element instanceof HTMLInputElement) return ''
  return normalizeWhitespace(element.textContent ?? '')
}

function labelForName(element: Element): string {
  const id = element.getAttribute('id')
  if (!id) return ''
  const labels = Array.from(document.querySelectorAll('label[for]'))
    .filter((label) => label.getAttribute('for') === id)
    .map((label) => normalizeWhitespace(label.textContent ?? ''))
    .filter(Boolean)
  return labels.join(' ')
}

type LabelledByResult = {
  name: string
  cycle: boolean
}

function labelledByName(element: Element, visited: Set<string>): LabelledByResult {
  const raw = element.getAttribute('aria-labelledby')
  if (!raw) return { name: '', cycle: false }

  const names: string[] = []
  for (const id of raw.split(/\s+/).filter(Boolean)) {
    if (visited.has(id)) return { name: '', cycle: true }
    visited.add(id)
    const referenced = document.getElementById(id)
    if (!referenced) continue
    const nested = labelledByName(referenced, new Set(visited))
    if (nested.cycle) return nested
    const aria = normalizeWhitespace(referenced.getAttribute('aria-label') ?? '')
    const text = textName(referenced)
    const value = nested.name || aria || text
    if (value) names.push(value)
  }
  return { name: normalizeWhitespace(names.join(' ')), cycle: false }
}

export function computeAccessibleName(element: Element): string {
  const labelledBy = labelledByName(element, new Set())
  if (labelledBy.name) return truncate(labelledBy.name)
  if (labelledBy.cycle) return fallbackRole(element)

  const aria = normalizeWhitespace(element.getAttribute('aria-label') ?? '')
  if (aria) return truncate(aria)

  const label = labelForName(element)
  if (label) return truncate(label)

  const placeholder = normalizeWhitespace(element.getAttribute('placeholder') ?? '')
  if (placeholder) return truncate(placeholder)

  const text = textName(element)
  if (text) return truncate(text)

  return fallbackRole(element)
}
