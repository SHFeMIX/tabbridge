import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  manifest: {
    name: 'TabBridge',
    permissions: ['tabs', 'scripting', 'storage', 'activeTab', 'offscreen', 'alarms'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    minimum_chrome_version: '116',
  },
  vite: () => ({
    plugins: [vue()],
  }),
})
