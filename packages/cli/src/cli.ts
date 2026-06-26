export type ParsedCli = {
  command: string
  json: boolean
  payload: Record<string, unknown>
}

function isValueFlag(token: string): boolean {
  return token.startsWith('--') && token !== '--json' && token !== '--current' && token !== '--text-stdin'
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index < 0) return undefined

  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--') || value === '-i') throw new Error(`${flag} requires a value`)

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

function positionalArgs(argv: string[]): string[] {
  const values: string[] = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token) continue
    if (token.startsWith('--')) {
      if (isValueFlag(token)) index += 1
      continue
    }
    if (token === '-i') continue
    values.push(token)
  }
  return values
}

function parseRefAction(first: string, argv: string[], json: boolean): ParsedCli {
  const [, ref, value] = positionalArgs(argv)
  if (!ref) throw new Error(`${first} requires a ref like @e1`)

  const payload: Record<string, unknown> = { ref }
  if (first === 'select') {
    if (!value) throw new Error('select requires a value')
    payload.value = value
  }

  return { command: `action.${first}`, json, payload }
}

function parseTextAction(first: 'fill' | 'type', argv: string[], json: boolean): ParsedCli {
  const [, ref, positionalText] = positionalArgs(argv)
  if (!ref) throw new Error(`${first} requires a ref like @e1`)

  const textFromStdin = hasFlag(argv, '--text-stdin')
  const flagText = readFlag(argv, '--text')
  const text = flagText ?? positionalText
  if (!text && !textFromStdin) throw new Error(`${first} requires text or --text-stdin`)

  return {
    command: `action.${first}`,
    json,
    payload: textFromStdin ? { ref, textFromStdin: true } : { ref, text },
  }
}

export function parseCli(argv: string[]): ParsedCli {
  const json = hasFlag(argv, '--json')
  const [first, second] = argv

  if (first === 'navigate') {
    throw new Error('navigate is not part of the TabBridge MVP command set')
  }

  if (first === 'status') return { command: 'status', json, payload: {} }
  if (first === 'doctor') return { command: 'doctor', json, payload: {} }

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

  if (first === 'connect') {
    const tabId = readNumberFlag(argv, '--tab')
    return { command: 'session.connect', json, payload: tabId === undefined ? { current: true } : { tabId } }
  }
  if (first === 'session') return { command: 'session.status', json, payload: {} }
  if (first === 'disconnect') return { command: 'session.disconnect', json, payload: {} }

  if (first === 'snapshot') return { command: 'snapshot', json, payload: { interactive: true } }
  if (first === 'text') return { command: 'text', json, payload: { maxBytes: readNumberFlag(argv, '--max-bytes') } }
  if (first === 'html') {
    return {
      command: 'html',
      json,
      payload: {
        ref: requireStringFlag(argv, '--ref', 'html'),
        maxBytes: readNumberFlag(argv, '--max-bytes'),
      },
    }
  }
  if (first === 'screenshot') {
    const [, path] = positionalArgs(argv)
    return { command: 'screenshot', json, payload: path ? { path } : {} }
  }

  const refActions = new Set(['click', 'clear', 'select', 'check', 'uncheck', 'focus'])
  if (first && refActions.has(first)) return parseRefAction(first, argv, json)
  if (first === 'fill' || first === 'type') return parseTextAction(first, argv, json)

  if (first === 'press') return { command: 'action.press', json, payload: { key: requireStringFlag(argv, '--key', 'press') } }
  if (first === 'scroll') return { command: 'action.scroll', json, payload: { dx: readNumberFlag(argv, '--dx') ?? 0, dy: readNumberFlag(argv, '--dy') ?? 0 } }
  if (first === 'click-coordinates') return { command: 'action.clickCoordinates', json, payload: { x: requireNumberFlag(argv, '--x', 'click-coordinates'), y: requireNumberFlag(argv, '--y', 'click-coordinates') } }
  if (first === 'drag-coordinates') return { command: 'action.dragCoordinates', json, payload: { fromX: requireNumberFlag(argv, '--from-x', 'drag-coordinates'), fromY: requireNumberFlag(argv, '--from-y', 'drag-coordinates'), toX: requireNumberFlag(argv, '--to-x', 'drag-coordinates'), toY: requireNumberFlag(argv, '--to-y', 'drag-coordinates') } }

  if (first === 'wait') return { command: 'wait', json, payload: { ms: requireNumberFlag(argv, '--ms', 'wait') } }
  if (first === 'wait-for-text') return { command: 'waitForText', json, payload: { text: requireStringFlag(argv, '--text', 'wait-for-text'), timeoutMs: readNumberFlag(argv, '--timeout') } }
  if (first === 'reload') return { command: 'navigation.reload', json, payload: {} }
  if (first === 'back') return { command: 'navigation.back', json, payload: {} }
  if (first === 'forward') return { command: 'navigation.forward', json, payload: {} }

  throw new Error(`Unknown tabbridge command: ${argv.join(' ')}`)
}
