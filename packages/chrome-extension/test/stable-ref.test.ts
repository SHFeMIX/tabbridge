import { describe, expect, it } from 'vitest'
import { createIdentityHash } from '../src/content/stable-ref'
import * as identityHelpers from '../src/content/stable-ref'

describe('internal element identity helpers', () => {
  it('creates deterministic hashes independent of key attribute insertion order', () => {
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
  })

  it('does not expose external stable refs for the vNext workflow', () => {
    expect(identityHelpers).not.toHaveProperty('createStableRef')
  })
})
