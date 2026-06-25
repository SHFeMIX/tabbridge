// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fingerprintElement } from '../src/content/element-fingerprint'

describe('fingerprintElement', () => {
  it('builds semantic fingerprints without sibling indexes or input values', () => {
    document.body.innerHTML = `
      <main>
        <form id="profile" aria-label="Profile form" action="https://example.com/profile?secret=yes">
          <input id="email" type="email" name="email" autocomplete="email" placeholder="Email" value="private@example.com">
        </form>
      </main>
    `

    const fingerprint = fingerprintElement(document.querySelector('input')!)

    expect(fingerprint.role).toBe('textbox')
    expect(fingerprint.accessibleName).toBe('Email')
    expect(fingerprint.textFingerprint).toBe('Email')
    expect(fingerprint.domSignature).toBe('main/form/input[type=email]')
    expect(fingerprint.formContext).toBe('Profile form')
    expect(fingerprint.keyAttributes).toMatchObject({ type: 'email', name: 'email', autocomplete: 'email', id: 'email' })
    expect(JSON.stringify(fingerprint)).not.toContain('private@example.com')
  })

  it('normalizes href key attributes to pathname only', () => {
    document.body.innerHTML = '<a href="https://example.com/settings?token=secret#hash">Settings</a>'

    expect(fingerprintElement(document.querySelector('a')!).keyAttributes).toMatchObject({ href: '/settings' })
  })
})
