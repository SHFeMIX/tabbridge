// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeElementState, stateLabels } from '../src/content/element-state'

describe('element state model', () => {
  it('computes disabled checked selected expanded hidden and focused states', () => {
    document.body.innerHTML = `
      <button id="disabled" disabled>Save</button>
      <input id="checked" type="checkbox" checked>
      <select><option id="selected" selected>One</option></select>
      <button id="expanded" aria-expanded="true">Menu</button>
      <button id="hidden" hidden>Hidden</button>
      <input id="focused">
    `
    ;(document.querySelector('#focused') as HTMLInputElement).focus()

    expect(computeElementState(document.querySelector('#disabled')!)).toMatchObject({ disabled: true })
    expect(computeElementState(document.querySelector('#checked')!)).toMatchObject({ checked: true })
    expect(computeElementState(document.querySelector('#selected')!)).toMatchObject({ selected: true })
    expect(computeElementState(document.querySelector('#expanded')!)).toMatchObject({ expanded: true })
    expect(computeElementState(document.querySelector('#hidden')!)).toMatchObject({ hidden: true })
    expect(computeElementState(document.querySelector('#focused')!)).toMatchObject({ focused: true })
  })

  it('emits stable state labels', () => {
    expect(stateLabels({ disabled: false, checked: true, selected: false, expanded: true, hidden: false, focused: false })).toEqual(['enabled', 'checked', 'expanded'])
    expect(stateLabels({ disabled: true, checked: false, selected: false, expanded: false, hidden: true, focused: false })).toEqual(['disabled', 'hidden'])
  })
})
