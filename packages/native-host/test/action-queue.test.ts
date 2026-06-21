import { describe, expect, it } from 'vitest'
import { TabActionQueue } from '../src/action-queue.js'

describe('per-tab action queue', () => {
  it('serializes actions for the same tab and allows independent tabs to progress', async () => {
    const queue = new TabActionQueue()
    const events: string[] = []

    const first = queue.run(1, async () => {
      events.push('tab1:first:start')
      await new Promise((resolve) => setTimeout(resolve, 10))
      events.push('tab1:first:end')
      return 'first'
    })
    const second = queue.run(1, async () => {
      events.push('tab1:second:start')
      events.push('tab1:second:end')
      return 'second'
    })
    const other = queue.run(2, async () => {
      events.push('tab2:start')
      events.push('tab2:end')
      return 'other'
    })

    await Promise.all([first, second, other])

    expect(events.indexOf('tab1:first:end')).toBeLessThan(events.indexOf('tab1:second:start'))
    expect(events).toContain('tab2:start')
    expect(events).toContain('tab2:end')
  })
})
