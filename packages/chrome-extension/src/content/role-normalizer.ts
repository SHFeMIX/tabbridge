export type NormalizedRole = 'button' | 'link' | 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'file' | 'dialog'

function normalizedAttribute(element: Element, name: string): string {
  return (element.getAttribute(name) ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function normalizeRole(element: Element): NormalizedRole | string {
  const explicit = normalizedAttribute(element, 'role')
  if (explicit) return explicit

  const tag = element.tagName.toLowerCase()
  if (tag === 'button') return 'button'
  if (tag === 'a' && element.hasAttribute('href')) return 'link'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'select') return 'combobox'
  if (tag === 'dialog' || normalizedAttribute(element, 'aria-modal') === 'true') return 'dialog'

  if (tag === 'input') {
    const type = normalizedAttribute(element, 'type') || 'text'
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'file') return 'file'
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button'
    return 'textbox'
  }

  return 'button'
}
