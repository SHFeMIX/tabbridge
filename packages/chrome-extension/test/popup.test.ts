import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import App from '../src/entrypoints/popup/App.vue'

describe('popup approval UI', () => {
  it('renders bridge status and empty approval state', () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockImplementation((_message, callback) => {
          if (callback) callback({ ok: true, data: { approvals: [] } })
        }),
      },
    })

    const wrapper = mount(App)
    expect(wrapper.text()).toContain('TabBridge')
    expect(wrapper.text()).toContain('No pending approvals')
  })
})
