import { describe, expect, it } from 'vitest'
import { isBrokerListening } from '../src/ensure-broker.js'

describe('ensure-broker helpers', () => {
  it('returns false when nothing is listening on the port', async () => {
    expect(await isBrokerListening('ws://127.0.0.1:1')).toBe(false)
  })
})
