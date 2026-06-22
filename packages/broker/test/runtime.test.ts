import { describe, expect, it } from 'vitest'
import { createRuntimePaths, generateToken, ensureSupportDir, writeToken, readToken } from '../src/runtime.js'

describe('broker runtime', () => {
  it('uses macOS Application Support path', () => {
    expect(createRuntimePaths('/Users/alice')).toEqual({
      supportDir: '/Users/alice/Library/Application Support/tabbridge',
      tokenPath: '/Users/alice/Library/Application Support/tabbridge/broker-token',
      lockPath: '/Users/alice/Library/Application Support/tabbridge/broker.lock',
    })
  })

  it('generates a 64-char hex token', () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{64}$/)
  })
})
