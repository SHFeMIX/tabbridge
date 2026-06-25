// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { normalizeRole } from '../src/content/role-normalizer'

describe('normalizeRole', () => {
  it('normalizes native interactive roles', () => {
    document.body.innerHTML = `
      <button id="button">Save</button>
      <a id="link" href="/settings">Settings</a>
      <textarea id="textarea"></textarea>
      <select id="select"><option>One</option></select>
      <dialog id="dialog"></dialog>
      <div id="modal" aria-modal="true"></div>
    `

    expect(normalizeRole(document.querySelector('#button')!)).toBe('button')
    expect(normalizeRole(document.querySelector('#link')!)).toBe('link')
    expect(normalizeRole(document.querySelector('#textarea')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#select')!)).toBe('combobox')
    expect(normalizeRole(document.querySelector('#dialog')!)).toBe('dialog')
    expect(normalizeRole(document.querySelector('#modal')!)).toBe('dialog')
  })

  it('normalizes input types precisely', () => {
    document.body.innerHTML = `
      <input id="text" type="text">
      <input id="email" type="email">
      <input id="search" type="search">
      <input id="password" type="password">
      <input id="checkbox" type="checkbox">
      <input id="radio" type="radio">
      <input id="file" type="file">
      <input id="submit" type="submit">
      <input id="button" type="button">
      <input id="reset" type="reset">
    `

    expect(normalizeRole(document.querySelector('#text')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#email')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#search')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#password')!)).toBe('textbox')
    expect(normalizeRole(document.querySelector('#checkbox')!)).toBe('checkbox')
    expect(normalizeRole(document.querySelector('#radio')!)).toBe('radio')
    expect(normalizeRole(document.querySelector('#file')!)).toBe('file')
    expect(normalizeRole(document.querySelector('#submit')!)).toBe('button')
    expect(normalizeRole(document.querySelector('#button')!)).toBe('button')
    expect(normalizeRole(document.querySelector('#reset')!)).toBe('button')
  })

  it('prefers explicit non-empty roles', () => {
    document.body.innerHTML = '<div role="menuitemcheckbox">Item</div><button role="  ">Button</button>'

    expect(normalizeRole(document.querySelector('div')!)).toBe('menuitemcheckbox')
    expect(normalizeRole(document.querySelector('button')!)).toBe('button')
  })
})
