import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'TabBridge',
    permissions: ['nativeMessaging', 'tabs', 'scripting', 'storage', 'activeTab'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    minimum_chrome_version: '105',
  },
  vite: () => ({
    plugins: [vue()],
  }),
})
