import { describe, expect, it } from 'vitest'
import { formatAgentSnapshotText, type AgentInteractiveSnapshot } from '../src/agent-snapshot.js'

describe('agent-browser-compatible snapshot formatting', () => {
  it('formats interactive refs as compact agent-browser-style text', () => {
    const snapshot: AgentInteractiveSnapshot = {
      page: { title: 'Example Site - Home', url: 'https://example.com' },
      refs: [
        { ref: '@e1', role: 'button', name: 'Sign In', text: 'Sign In', attributes: {} },
        { ref: '@e2', role: 'input', name: 'Email', text: '', attributes: { type: 'email', placeholder: 'Email' } },
        { ref: '@e3', role: 'button', name: 'Submit', text: 'Submit', attributes: { type: 'submit' } },
      ],
    }

    expect(formatAgentSnapshotText(snapshot)).toBe([
      'Page: Example Site - Home',
      'URL: https://example.com',
      '',
      '@e1 [button] "Sign In"',
      '@e2 [input type="email"] placeholder="Email"',
      '@e3 [button type="submit"] "Submit"',
    ].join('\n'))
  })

  it('formats empty interactive snapshots with a clear empty marker', () => {
    const snapshot: AgentInteractiveSnapshot = {
      page: { title: 'Empty Page', url: 'https://example.com/empty' },
      refs: [],
    }

    expect(formatAgentSnapshotText(snapshot)).toBe([
      'Page: Empty Page',
      'URL: https://example.com/empty',
      '',
      '(No interactive elements found)',
    ].join('\n'))
  })
})
