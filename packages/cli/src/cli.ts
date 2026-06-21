export type ParsedCli = {
  command: string
  json: boolean
  payload: Record<string, unknown>
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index < 0) return undefined

  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`)

  return value
}

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag)
}

function readNumberFlag(argv: string[], flag: string): number | undefined {
  const value = readFlag(argv, flag)
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer`)
  return parsed
}

function requireNumberFlag(argv: string[], flag: string, command: string): number {
  const value = readNumberFlag(argv, flag)
  if (value === undefined) throw new Error(`${command} requires ${flag}`)
  return value
}

function requireStringFlag(argv: string[], flag: string, command: string): string {
  const value = readFlag(argv, flag)
  if (!value) throw new Error(`${command} requires ${flag}`)
  return value
}

export function parseCli(argv: string[]): ParsedCli {
  const json = hasFlag(argv, '--json')
  const [first, second] = argv

  if (first === 'navigate') {
    throw new Error('navigate is not part of the TabBridge MVP command set')
  }

  if (first === 'status') return { command: 'status', json, payload: {} }
  if (first === 'doctor') return { command: 'doctor', json, payload: {} }
  if (first === 'native-host') return { command: 'nativeHost', json, payload: {} }

  if (first === 'install-native-host') {
    return {
      command: 'installNativeHost',
      json,
      payload: {
        browser: requireStringFlag(argv, '--browser', 'install-native-host'),
        extensionId: requireStringFlag(argv, '--extension-id', 'install-native-host'),
      },
    }
  }

  if (first === 'uninstall-native-host') {
    return {
      command: 'uninstallNativeHost',
      json,
      payload: { browser: requireStringFlag(argv, '--browser', 'uninstall-native-host') },
    }
  }

  if (first === 'tabs' && second === 'list') return { command: 'tabs.list', json, payload: {} }
  if (first === 'tabs' && second === 'current') return { command: 'tabs.current', json, payload: {} }
  if (first === 'tabs' && second === 'release') {
    return { command: 'tabs.release', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'tabs release') } }
  }
  if (first === 'tabs' && second === 'request-access') {
    return {
      command: 'tabs.requestAccess',
      json,
      payload: {
        tabId: requireNumberFlag(argv, '--tab', 'tabs request-access'),
        reason: requireStringFlag(argv, '--reason', 'tabs request-access'),
      },
    }
  }

  if (first === 'approvals' && second === 'status') {
    return { command: 'approvals.status', json, payload: { approvalId: requireStringFlag(argv, '--id', 'approvals status') } }
  }
  if (first === 'approvals' && second === 'cancel') {
    return { command: 'approvals.cancel', json, payload: { approvalId: requireStringFlag(argv, '--id', 'approvals cancel') } }
  }
  if (first === 'approvals' && second === 'wait') {
    const timeout = readNumberFlag(argv, '--timeout')
    return { command: 'approvals.wait', json, payload: { approvalId: requireStringFlag(argv, '--id', 'approvals wait'), timeoutMs: timeout } }
  }

  if (first === 'snapshot') {
    return { command: 'snapshot', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'snapshot'), includeUrl: hasFlag(argv, '--include-url') } }
  }
  if (first === 'text') {
    return { command: 'text', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'text'), maxBytes: readNumberFlag(argv, '--max-bytes') } }
  }
  if (first === 'html') {
    return {
      command: 'html',
      json,
      payload: {
        tabId: requireNumberFlag(argv, '--tab', 'html'),
        snapshotId: requireStringFlag(argv, '--snapshot-id', 'html'),
        ref: requireStringFlag(argv, '--ref', 'html'),
        maxBytes: readNumberFlag(argv, '--max-bytes'),
      },
    }
  }
  if (first === 'screenshot') return { command: 'screenshot', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'screenshot') } }

  const refActions = new Set(['click', 'clear', 'select', 'check', 'uncheck', 'focus'])
  if (first && refActions.has(first)) {
    const tabId = readNumberFlag(argv, '--tab')
    const snapshotId = readFlag(argv, '--snapshot-id')
    const ref = readFlag(argv, '--ref')
    if (tabId === undefined || !snapshotId || !ref) throw new Error(`${first} requires --tab, --snapshot-id, and --ref`)
    const payload: Record<string, unknown> = { tabId, snapshotId, ref }
    if (first === 'select') payload.value = requireStringFlag(argv, '--value', 'select')
    return { command: `action.${first}`, json, payload }
  }

  if (first === 'type') {
    const tabId = readNumberFlag(argv, '--tab')
    const snapshotId = readFlag(argv, '--snapshot-id')
    const ref = readFlag(argv, '--ref')
    if (tabId === undefined || !snapshotId || !ref) throw new Error('type requires --tab, --snapshot-id, and --ref')
    const text = readFlag(argv, '--text')
    const textFromStdin = hasFlag(argv, '--text-stdin')
    if (!text && !textFromStdin) throw new Error('type requires --text or --text-stdin')
    return { command: 'action.type', json, payload: textFromStdin ? { tabId, snapshotId, ref, textFromStdin: true } : { tabId, snapshotId, ref, text } }
  }

  if (first === 'press') return { command: 'action.press', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'press'), key: requireStringFlag(argv, '--key', 'press') } }
  if (first === 'scroll') return { command: 'action.scroll', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'scroll'), dx: readNumberFlag(argv, '--dx') ?? 0, dy: readNumberFlag(argv, '--dy') ?? 0 } }
  if (first === 'click-coordinates') return { command: 'action.clickCoordinates', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'click-coordinates'), x: requireNumberFlag(argv, '--x', 'click-coordinates'), y: requireNumberFlag(argv, '--y', 'click-coordinates') } }
  if (first === 'drag-coordinates') return { command: 'action.dragCoordinates', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'drag-coordinates'), fromX: requireNumberFlag(argv, '--from-x', 'drag-coordinates'), fromY: requireNumberFlag(argv, '--from-y', 'drag-coordinates'), toX: requireNumberFlag(argv, '--to-x', 'drag-coordinates'), toY: requireNumberFlag(argv, '--to-y', 'drag-coordinates') } }

  if (first === 'wait') return { command: 'wait', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'wait'), ms: requireNumberFlag(argv, '--ms', 'wait') } }
  if (first === 'wait-for-text') return { command: 'waitForText', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'wait-for-text'), text: requireStringFlag(argv, '--text', 'wait-for-text'), timeoutMs: readNumberFlag(argv, '--timeout') } }
  if (first === 'reload') return { command: 'navigation.reload', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'reload') } }
  if (first === 'back') return { command: 'navigation.back', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'back') } }
  if (first === 'forward') return { command: 'navigation.forward', json, payload: { tabId: requireNumberFlag(argv, '--tab', 'forward') } }

  throw new Error(`Unknown tabbridge command: ${argv.join(' ')}`)
}
