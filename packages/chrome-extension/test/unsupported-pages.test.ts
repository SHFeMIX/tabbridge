import { describe, expect, it } from 'vitest'
import { unsupportedPageReason } from '../src/content/unsupported-pages'

describe('unsupported page detection', () => {
  it('blocks Chrome internal pages and special URLs', () => {
    expect(unsupportedPageReason('chrome://settings')).toBe('UNSUPPORTED_PAGE')
    expect(unsupportedPageReason('chrome-extension://abc/options.html')).toBe('UNSUPPORTED_PAGE')
    expect(unsupportedPageReason('devtools://devtools/bundled')).toBe('UNSUPPORTED_PAGE')
    expect(unsupportedPageReason('file:///Users/alice/private.txt')).toBe('UNSUPPORTED_PAGE')
    expect(unsupportedPageReason('https://github.com')).toBeUndefined()
  })
})
