export class ExtensionActionQueue {
  private tails = new Map<number, Promise<unknown>>()

  async run<T>(tabId: number, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(tabId) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(action)
    this.tails.set(tabId, next)

    try {
      return await next
    } finally {
      if (this.tails.get(tabId) === next) this.tails.delete(tabId)
    }
  }
}
