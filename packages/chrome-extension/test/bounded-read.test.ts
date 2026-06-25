// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readVisibleText, sanitizeElementHtml } from '../src/content/bounded-read'

describe('bounded reads', () => {
  it('limits visible text by byte count', () => {
    document.body.innerHTML = '<main><p>Hello visible world</p><script>secret()</script></main>'
    expect(readVisibleText(document, 11)).toEqual({ ok: true, text: 'Hello visib', truncated: true })
  })

  it('limits visible text by byte count without splitting multi-byte characters', () => {
    document.body.innerHTML = '<main><p>🙂🙂a</p></main>'
    expect(readVisibleText(document, 8)).toEqual({ ok: true, text: '🙂🙂', truncated: true })
  })

  it('sanitizes html by removing scripts, styles, hidden inputs, and form values', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<form><input value="secret"><input type="hidden" value="token"><script>secret()</script><style>.x{}</style><button>Send</button></form>'
    expect(sanitizeElementHtml(wrapper, 1000)).toEqual({
      ok: true,
      html: '<div><form><input><button>Send</button></form></div>',
      truncated: false,
    })
  })
})
