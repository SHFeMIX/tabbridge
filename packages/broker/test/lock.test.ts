import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { acquireBrokerLock } from '../src/lock.js'

describe('broker lock', () => {
  it('allows only one lock holder', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-lock-'))
    const lockFile = path.join(dir, 'broker.lock')
    await fs.writeFile(lockFile, '')
    const release = await acquireBrokerLock(lockFile)
    await expect(acquireBrokerLock(lockFile)).rejects.toThrow()
    await release()
  })
})
