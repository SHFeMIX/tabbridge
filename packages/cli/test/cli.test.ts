import { describe, expect, it } from 'vitest'
import { parseCli } from '../src/cli.js'

describe('CLI parser', () => {
  it('parses tabs list with json mode', () => {
    expect(parseCli(['tabs', 'list', '--json'])).toEqual({
      command: 'tabs.list',
      json: true,
      payload: {},
    })
  })

  it('parses request-access reason and tab id', () => {
    expect(parseCli(['tabs', 'request-access', '--tab', '123', '--reason', 'Check pull request status', '--json'])).toEqual({
      command: 'tabs.requestAccess',
      json: true,
      payload: { tabId: 123, reason: 'Check pull request status' },
    })
  })

  it('requires snapshot id for ref-based actions', () => {
    expect(() => parseCli(['click', '--tab', '123', '--ref', '@e1', '--json'])).toThrow('click requires --tab, --snapshot-id, and --ref')
  })

  it('parses type stdin without placing text in argv payload', () => {
    expect(parseCli(['type', '--tab', '123', '--snapshot-id', 'snap_1', '--ref', '@e1', '--text-stdin', '--json'])).toEqual({
      command: 'action.type',
      json: true,
      payload: { tabId: 123, snapshotId: 'snap_1', ref: '@e1', textFromStdin: true },
    })
  })

  it('parses status native host diagnostic target flags', () => {
    expect(parseCli(['status', '--browser', 'chromium', '--extension-id', 'abcdefghijklmnopabcdefghijklmnop', '--json'])).toEqual({
      command: 'status',
      json: true,
      payload: { browser: 'chromium', extensionId: 'abcdefghijklmnopabcdefghijklmnop' },
    })
  })

  it('parses doctor native host diagnostic target flags', () => {
    expect(parseCli(['doctor', '--browser', 'chrome', '--extension-id', 'abcdefghijklmnopabcdefghijklmnop', '--json'])).toEqual({
      command: 'doctor',
      json: true,
      payload: { browser: 'chrome', extensionId: 'abcdefghijklmnopabcdefghijklmnop' },
    })
  })

  it('rejects navigate because it is outside the MVP command set', () => {
    expect(() => parseCli(['navigate', '--tab', '123', '--url', 'https://example.com', '--json'])).toThrow('navigate is not part of the TabBridge MVP command set')
  })

  it('rejects a value flag when its value is missing', () => {
    expect(() => parseCli(['tabs', 'request-access', '--tab', '123', '--reason', '--json'])).toThrow('--reason requires a value')
  })

  it('rejects a value flag when the next token is another flag', () => {
    expect(() => parseCli(['type', '--tab', '123', '--snapshot-id', 'snap_1', '--ref', '@e1', '--text', '--json'])).toThrow('--text requires a value')
  })
})
