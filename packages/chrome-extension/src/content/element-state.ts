import type { ElementState } from '@tabbridge/shared'

function hasBooleanProperty(element: Element, key: 'disabled' | 'checked' | 'selected'): boolean {
  return key in element && Boolean((element as HTMLInputElement & HTMLOptionElement & HTMLButtonElement)[key])
}

export function computeElementState(element: Element): ElementState {
  const html = element as HTMLElement
  const style = window.getComputedStyle(html)
  return {
    disabled: hasBooleanProperty(element, 'disabled') || element.getAttribute('aria-disabled') === 'true',
    checked: hasBooleanProperty(element, 'checked') || element.getAttribute('aria-checked') === 'true',
    selected: hasBooleanProperty(element, 'selected') || element.getAttribute('aria-selected') === 'true',
    expanded: element.getAttribute('aria-expanded') === 'true',
    hidden: element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden',
    focused: document.activeElement === element,
  }
}

export function stateLabels(state: ElementState): string[] {
  const labels: string[] = []
  labels.push(state.disabled ? 'disabled' : 'enabled')
  if (state.checked) labels.push('checked')
  if (state.selected) labels.push('selected')
  if (state.expanded) labels.push('expanded')
  if (state.hidden) labels.push('hidden')
  if (state.focused) labels.push('focused')
  return labels
}

export type { ElementState }
