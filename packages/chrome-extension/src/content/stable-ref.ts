export type IdentityInput = {
  role: string
  accessibleName: string
  domSignature: string
  keyAttributes: Record<string, string>
  formContext?: string
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function stableJson(input: IdentityInput): string {
  const sortedAttributes = Object.fromEntries(Object.entries(input.keyAttributes).sort(([left], [right]) => left.localeCompare(right)))
  return JSON.stringify({
    role: normalize(input.role),
    accessibleName: normalize(input.accessibleName),
    domSignature: normalize(input.domSignature),
    keyAttributes: sortedAttributes,
    formContext: normalize(input.formContext ?? ''),
  })
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  const first = (hash >>> 0).toString(16).padStart(8, '0')
  let secondHash = 0x811c9dc5
  for (let index = value.length - 1; index >= 0; index -= 1) {
    secondHash ^= value.charCodeAt(index)
    secondHash = Math.imul(secondHash, 0x01000193)
  }
  const second = (secondHash >>> 0).toString(16).padStart(8, '0')
  return `${first}${second}`.slice(0, 12)
}

export function createIdentityHash(input: IdentityInput): string {
  return fnv1a(stableJson(input))
}

export function createStableRef(identityHash: string): string {
  return `@r_${identityHash}`
}
