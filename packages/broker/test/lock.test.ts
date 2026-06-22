import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { acquireBrokerLock } from '../src/lock.js'

describe('broker lock', () => {
  let dir: string
  let lockFile: string

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-lock-'))
    lockFile = path.join(dir, 'broker.lock')
  })

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('allows only one lock holder', async () => {
    await fs.writeFile(lockFile, '')
    const release = await acquireBrokerLock(lockFile)
    await expect(acquireBrokerLock(lockFile)).rejects.toThrow()
    await release()
  })
})
