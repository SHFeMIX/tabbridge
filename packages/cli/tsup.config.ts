import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  clean: true,
  splitting: false,
  // Workspace packages are intentionally bundled into the CLI so users do not
  // need to install the private @tabbridge/* packages.
  noExternal: ['@tabbridge/broker', '@tabbridge/shared'],
})
