import { describe, expect, it } from 'vitest'
import { classifyRisk } from '../src/index.js'

describe('risk classifier', () => {
  it('classifies ordinary focus as low risk', () => {
    expect(classifyRisk({ command: 'focus', role: 'textbox', name: 'Search', text: '', usesCoordinates: false })).toEqual({
      risk: 'low',
      reasons: [],
    })
  })

  it('classifies delete submit buttons as high risk with reasons', () => {
    expect(classifyRisk({ command: 'click', role: 'button', name: 'Delete repository', text: 'Delete repository', usesCoordinates: false })).toEqual({
      risk: 'high',
      reasons: ["element text contains 'delete'"],
    })
  })

  it('classifies coordinate actions as high risk fallback operations', () => {
    expect(classifyRisk({ command: 'click-coordinates', role: undefined, name: undefined, text: undefined, usesCoordinates: true })).toEqual({
      risk: 'high',
      reasons: ['coordinate action cannot be tied to a stable semantic ref'],
    })
  })

  it('classifies credential fields as high risk and redaction-required', () => {
    expect(classifyRisk({ command: 'type', role: 'textbox', name: 'Password', text: '', inputType: 'password', usesCoordinates: false })).toEqual({
      risk: 'high',
      reasons: ['field accepts password or credential-like input'],
    })
  })
})
