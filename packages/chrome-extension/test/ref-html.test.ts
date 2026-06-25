// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ElementRefRecord } from '@tabbridge/shared'
import { readRefHtml } from '../src/content/ref-html'

const states = { disabled: false, checked: false, selected: false, expanded: false, hidden: false, focused: false }

function record(overrides: Partial<ElementRefRecord>): ElementRefRecord {
  return {
    snapshotId: 'snap_1',
    tabId: 1,
    frameRef: 'f0',
    ref: '@r_send',
    identityHash: 'stored-send',
    role: 'button',
    accessibleName: 'Send',
    name: 'Send',
    textFingerprint: 'Send',
    domSignature: 'main/form/button',
    keyAttributes: {},
    states,
    boundingBox: [0, 0, 100, 40],
    generatedAt: 1000,
    selectorCandidates: [],
    xpathCandidates: [],
    ...overrides,
  }
}

describe('readRefHtml', () => {
  it('sanitizes html from a semantic ref match without selector candidates', () => {
    document.body.innerHTML = '<main><form><input value="secret"><button>Send</button></form></main>'

    expect(readRefHtml(record({}), 1000)).toEqual({ ok: true, html: '<button>Send</button>', truncated: false })
  })

  it('returns undefined for ambiguous semantic matches', () => {
    document.body.innerHTML = '<main><button>Send</button><button>Send</button></main>'

    expect(readRefHtml(record({ domSignature: 'main/button' }), 1000)).toBeUndefined()
  })
})
