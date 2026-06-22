import { describe, expect, it } from 'vitest'
import { runBroker } from '../src/main.js'

describe('runBroker', () => {
  it('starts a server on the configured port and can be closed', async () => {
    const broker = await runBroker()
    expect(broker.port).toBe(9876)
    await broker.close()
  })
})
