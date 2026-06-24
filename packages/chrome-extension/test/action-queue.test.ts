import { describe, expect, it } from 'vitest'
import { ExtensionActionQueue } from '../src/background/action-queue'

describe('extension action queue', () => {
  it('serializes meaningful actions by tab id', async () => {
    const queue = new ExtensionActionQueue()
    const events: string[] = []

    await Promise.all([
      queue.run(3, async () => {
        events.push('first-start')
        await new Promise((resolve) => setTimeout(resolve, 5))
        events.push('first-end')
      }),
      queue.run(3, async () => {
        events.push('second-start')
      }),
    ])

    expect(events).toEqual(['first-start', 'first-end', 'second-start'])
  })
})
