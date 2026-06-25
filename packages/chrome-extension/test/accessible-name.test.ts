// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeAccessibleName } from '../src/content/accessible-name'

describe('computeAccessibleName', () => {
  it('uses aria-labelledby references in declared order and follows reference chains', () => {
    document.body.innerHTML = `
      <span id="first">  Save   </span>
      <span id="second" aria-labelledby="nested"></span>
      <span id="nested"> changes </span>
      <button aria-labelledby="first second">Ignored text</button>
    `

    expect(computeAccessibleName(document.querySelector('button')!)).toBe('Save changes')
  })

  it('does not loop forever for cyclic aria-labelledby references', () => {
    document.body.innerHTML = `
      <span id="a" aria-labelledby="b">Alpha</span>
      <span id="b" aria-labelledby="a">Beta</span>
      <button aria-labelledby="a">Fallback text</button>
    `

    expect(computeAccessibleName(document.querySelector('button')!)).toBe('button')
  })

  it('uses aria-label before label placeholder and text', () => {
    document.body.innerHTML = `
      <label for="email">Email label</label>
      <input id="email" aria-label="Email aria" placeholder="Email placeholder" value="secret@example.com">
    `

    expect(computeAccessibleName(document.querySelector('input')!)).toBe('Email aria')
  })

  it('uses label for form controls when aria label is absent', () => {
    document.body.innerHTML = '<label for="comment">Comment</label><textarea id="comment"></textarea>'

    expect(computeAccessibleName(document.querySelector('textarea')!)).toBe('Comment')
  })

  it('uses placeholder and never leaks input values', () => {
    document.body.innerHTML = '<input placeholder="Search docs" value="private typed query">'

    expect(computeAccessibleName(document.querySelector('input')!)).toBe('Search docs')
  })

  it('normalizes whitespace and truncates long text to 120 chars', () => {
    const longText = 'Create '.repeat(40)
    document.body.innerHTML = `<button>${longText}</button>`

    const name = computeAccessibleName(document.querySelector('button')!)

    expect(name.length).toBeLessThanOrEqual(120)
    expect(name).not.toContain('  ')
    expect(name.startsWith('Create Create')).toBe(true)
  })
})
