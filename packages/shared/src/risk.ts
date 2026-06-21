export type RiskLevel = 'low' | 'medium' | 'high' | 'dangerous'

export type RiskInput = {
  command: string
  role?: string | undefined
  name?: string | undefined
  text?: string | undefined
  inputType?: string | undefined
  usesCoordinates: boolean
  willNavigate?: boolean | undefined
  domainSensitive?: boolean | undefined
}

export type RiskClassification = {
  risk: RiskLevel
  reasons: string[]
}

const DANGEROUS_WORDS = ['delete', 'pay', 'purchase', 'send', 'confirm', 'transfer', 'publish', 'merge']
const CREDENTIAL_WORDS = ['password', 'passcode', '2fa', 'two-factor', 'verification code', 'token', 'credit card', 'payment']

export function classifyRisk(input: RiskInput): RiskClassification {
  const reasons: string[] = []
  const haystack = `${input.role ?? ''} ${input.name ?? ''} ${input.text ?? ''}`.toLowerCase()

  for (const word of DANGEROUS_WORDS) {
    if (haystack.includes(word)) {
      reasons.push(`element text contains '${word}'`)
      break
    }
  }

  if (input.usesCoordinates) {
    reasons.push('coordinate action cannot be tied to a stable semantic ref')
  }

  if (input.willNavigate) {
    reasons.push('action may navigate the current tab')
  }

  if (input.domainSensitive) {
    reasons.push('domain is configured as sensitive')
  }

  if (input.inputType === 'password' || CREDENTIAL_WORDS.some((word) => haystack.includes(word))) {
    reasons.push('field accepts password or credential-like input')
  }

  if (input.command.includes('dangerous')) {
    return { risk: 'dangerous', reasons: [...reasons, 'command is explicitly dangerous'] }
  }

  if (reasons.length > 0) {
    return { risk: 'high', reasons }
  }

  if (input.command === 'type' || input.command === 'select' || input.command === 'check' || input.command === 'uncheck') {
    return { risk: 'medium', reasons: [] }
  }

  return { risk: 'low', reasons: [] }
}
