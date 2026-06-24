// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { waitForTextInDocument, waitMs } from '../src/background/commands'

describe('wait commands', () => {
  it('waits a requested number of milliseconds', async () => {
    const started = Date.now()
    await waitMs(5)
    expect(Date.now() - started).toBeGreaterThanOrEqual(4)
  })

  it('finds text already present in the document', async () => {
    document.body.innerHTML = '<main>Build passed</main>'
    await expect(waitForTextInDocument(document, 'Build passed', 10)).resolves.toEqual({ found: true, text: 'Build passed' })
  })
})
