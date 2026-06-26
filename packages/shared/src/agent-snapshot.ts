export type AgentSnapshotPage = {
  title: string
  url: string
}

export type AgentSnapshotRef = {
  ref: string
  role: string
  name: string
  text: string
  attributes: Record<string, string>
}

export type AgentInteractiveSnapshot = {
  page: AgentSnapshotPage
  refs: AgentSnapshotRef[]
  text?: string
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function formatTypeAttribute(attributes: Record<string, string>): string {
  const type = attributes.type
  return type ? ` type=${quote(type)}` : ''
}

function formatExternalAttributes(attributes: Record<string, string>): string {
  const entries = Object.entries(attributes).filter(([key, value]) => key !== 'type' && value.length > 0)
  if (entries.length === 0) return ''
  return ` ${entries.map(([key, value]) => `${key}=${quote(value)}`).join(' ')}`
}

function formatRefLine(ref: AgentSnapshotRef): string {
  const suffix = ref.text ? ` ${quote(ref.text)}` : formatExternalAttributes(ref.attributes)
  return `${ref.ref} [${ref.role}${formatTypeAttribute(ref.attributes)}]${suffix}`
}

export function formatAgentSnapshotText(snapshot: AgentInteractiveSnapshot): string {
  const lines = [
    `Page: ${snapshot.page.title}`,
    `URL: ${snapshot.page.url}`,
    '',
  ]

  if (snapshot.refs.length === 0) {
    lines.push('(No interactive elements found)')
  } else {
    lines.push(...snapshot.refs.map(formatRefLine))
  }

  return lines.join('\n')
}
