import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import App from '../src/entrypoints/popup/App.vue'

function createChromeStub(initialApprovals: unknown[] = []) {
  const storageListeners = new Set<(changes: Record<string, { newValue?: unknown }>) => void>()
  return {
    runtime: {
      sendMessage: vi.fn().mockImplementation((_message, callback) => {
        if (callback) callback({ ok: true, data: { approvals: initialApprovals } })
      }),
    },
    storage: {
      onChanged: {
        addListener: vi.fn((listener) => { storageListeners.add(listener) }),
        removeListener: vi.fn((listener) => { storageListeners.delete(listener) }),
      },
    },
    emitStorageChange: (newApprovals: unknown[]) => {
      storageListeners.forEach((listener) => {
        listener({ 'tabbridge.approvals': { newValue: newApprovals } })
      })
    },
  }
}

describe('popup approval UI', () => {
  it('renders bridge status and empty approval state', () => {
    vi.stubGlobal('chrome', createChromeStub())

    const wrapper = mount(App)
    expect(wrapper.text()).toContain('TabBridge')
    expect(wrapper.text()).toContain('没有待处理的审批')
  })

  it('updates approvals when chrome.storage.onChanged fires', async () => {
    const chromeStub = createChromeStub()
    vi.stubGlobal('chrome', chromeStub)

    const wrapper = mount(App)
    expect(wrapper.text()).toContain('没有待处理的审批')

    chromeStub.emitStorageChange([
      { id: 'appr_1', kind: 'site-access', status: 'pending', createdAt: 1, expiresAt: Date.now() + 300_000, summary: 'Allow github.com for tab 1: Review PR', executed: false },
    ])

    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Allow github.com for tab 1: Review PR')
    expect(wrapper.text()).toContain('允许')
  })
})
