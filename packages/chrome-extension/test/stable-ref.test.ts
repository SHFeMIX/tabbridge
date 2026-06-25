import { describe, expect, it } from 'vitest'
import { createIdentityHash, createStableRef } from '../src/content/stable-ref'

describe('stable refs', () => {
  it('creates deterministic identity hashes independent of key attribute insertion order', () => {
    const first = createIdentityHash({
      role: 'button',
      accessibleName: 'Save changes',
      domSignature: 'main/form/button',
      keyAttributes: { name: 'save', type: 'submit' },
      formContext: 'profile',
    })
    const second = createIdentityHash({
      role: 'button',
      accessibleName: 'Save changes',
      domSignature: 'main/form/button',
      keyAttributes: { type: 'submit', name: 'save' },
      formContext: 'profile',
    })

    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{12}$/)
    expect(createStableRef(first)).toBe(`@r_${first}`)
  })
})
