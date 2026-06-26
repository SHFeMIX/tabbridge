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

  it('parses snapshot and snapshot -i as interactive snapshots', () => {
    expect(parseCli(['snapshot'])).toEqual({
      command: 'snapshot',
      json: false,
      payload: { interactive: true },
    })
    expect(parseCli(['snapshot', '-i', '--json'])).toEqual({
      command: 'snapshot',
      json: true,
      payload: { interactive: true },
    })
  })

  it('parses positional ref actions without tab or snapshot id', () => {
    expect(parseCli(['click', '@e1', '--json'])).toEqual({
      command: 'action.click',
      json: true,
      payload: { ref: '@e1' },
    })
    expect(parseCli(['fill', '@e2', 'hello'])).toEqual({
      command: 'action.fill',
      json: false,
      payload: { ref: '@e2', text: 'hello' },
    })
    expect(parseCli(['select', '@e3', 'us-east-1'])).toEqual({
      command: 'action.select',
      json: false,
      payload: { ref: '@e3', value: 'us-east-1' },
    })
  })

  it('parses stdin text for fill and type', () => {
    expect(parseCli(['fill', '@e1', '--text-stdin', '--json'])).toEqual({
      command: 'action.fill',
      json: true,
      payload: { ref: '@e1', textFromStdin: true },
    })
    expect(parseCli(['type', '@e1', '--text-stdin', '--json'])).toEqual({
      command: 'action.type',
      json: true,
      payload: { ref: '@e1', textFromStdin: true },
    })
  })

  it('parses current-tab session commands', () => {
    expect(parseCli(['connect', '--current', '--json'])).toEqual({
      command: 'session.connect',
      json: true,
      payload: { current: true },
    })
    expect(parseCli(['connect', '--tab', '123'])).toEqual({
      command: 'session.connect',
      json: false,
      payload: { tabId: 123 },
    })
    expect(parseCli(['session'])).toEqual({ command: 'session.status', json: false, payload: {} })
    expect(parseCli(['disconnect'])).toEqual({ command: 'session.disconnect', json: false, payload: {} })
  })

  it('parses text screenshot and navigation without tab flags', () => {
    expect(parseCli(['text', '--json'])).toEqual({ command: 'text', json: true, payload: {} })
    expect(parseCli(['screenshot', 'page.png'])).toEqual({ command: 'screenshot', json: false, payload: { path: 'page.png' } })
    expect(parseCli(['reload'])).toEqual({ command: 'navigation.reload', json: false, payload: {} })
    expect(parseCli(['back'])).toEqual({ command: 'navigation.back', json: false, payload: {} })
    expect(parseCli(['forward'])).toEqual({ command: 'navigation.forward', json: false, payload: {} })
  })

  it('parses dash-prefixed free text and negative numeric flag values', () => {
    expect(parseCli(['fill', '@e1', '-prefixed'])).toEqual({
      command: 'action.fill',
      json: false,
      payload: { ref: '@e1', text: '-prefixed' },
    })
    expect(parseCli(['scroll', '--dy', '-500', '--json'])).toEqual({
      command: 'action.scroll',
      json: true,
      payload: { dx: 0, dy: -500 },
    })
  })

  it('rejects ref actions without a positional ref', () => {
    expect(() => parseCli(['click'])).toThrow('click requires a ref like @e1')
    expect(() => parseCli(['fill', '@e1'])).toThrow('fill requires text or --text-stdin')
  })

  it('parses status without native host diagnostic payload', () => {
    expect(parseCli(['status', '--json'])).toEqual({
      command: 'status',
      json: true,
      payload: {},
    })
  })

  it('parses doctor without native host diagnostic payload', () => {
    expect(parseCli(['doctor', '--json'])).toEqual({
      command: 'doctor',
      json: true,
      payload: {},
    })
  })

  it('rejects removed native host commands', () => {
    expect(() => parseCli(['native-host'])).toThrow('Unknown tabbridge command: native-host')
    expect(() => parseCli(['install-native-host', '--browser', 'chrome', '--extension-id', 'ext'])).toThrow('Unknown tabbridge command: install-native-host --browser chrome --extension-id ext')
    expect(() => parseCli(['uninstall-native-host', '--browser', 'chrome'])).toThrow('Unknown tabbridge command: uninstall-native-host --browser chrome')
  })

  it('rejects navigate because it is outside the MVP command set', () => {
    expect(() => parseCli(['navigate', '--tab', '123', '--url', 'https://example.com', '--json'])).toThrow('navigate is not part of the TabBridge MVP command set')
  })

  it('rejects a value flag when its value is missing', () => {
    expect(() => parseCli(['tabs', 'request-access', '--tab', '123', '--reason', '--json'])).toThrow('--reason requires a value')
  })

  it('rejects a value flag when the next token is another flag', () => {
    expect(() => parseCli(['type', '@e1', '--text', '--json'])).toThrow('--text requires a value')
  })
})
