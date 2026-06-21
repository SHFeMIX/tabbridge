import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/shared',
  'packages/cli',
  'packages/native-host',
  'packages/chrome-extension',
])
