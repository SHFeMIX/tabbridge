export type BoundedReadResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: true; html: string; truncated: boolean }
  | { ok: false; code: 'MESSAGE_TOO_LARGE' | 'ELEMENT_SCOPE_TOO_LARGE'; message: string }

function limitUtf8(input: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoder = new TextEncoder()
  let output = ''
  let byteLength = 0
  for (const char of input) {
    const charBytes = encoder.encode(char).byteLength
    if (byteLength + charBytes > maxBytes) return { value: output, truncated: true }
    byteLength += charBytes
    output += char
  }
  return { value: output, truncated: false }
}

export function readVisibleText(doc: Document, maxBytes: number): BoundedReadResult {
  const clone = doc.body.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script,style,noscript,input[type="hidden"]').forEach((node) => node.remove())
  const text = clone.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const limited = limitUtf8(text, maxBytes)
  return { ok: true, text: limited.value, truncated: limited.truncated }
}

export function sanitizeElementHtml(element: Element, maxBytes: number): BoundedReadResult {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script,style,noscript,input[type="hidden"]').forEach((node) => node.remove())
  clone.querySelectorAll('input,textarea').forEach((node) => {
    node.removeAttribute('value')
    node.textContent = ''
  })
  clone.querySelectorAll('[data-token],[data-secret]').forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      if (attr.name.includes('token') || attr.name.includes('secret')) node.removeAttribute(attr.name)
    }
  })

  const html = clone.outerHTML
  const limited = limitUtf8(html, maxBytes)
  return { ok: true, html: limited.value, truncated: limited.truncated }
}
