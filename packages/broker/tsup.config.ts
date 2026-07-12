import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts'],
  format: 'esm',
  dts: true,
  clean: true,
  splitting: false,
  noExternal: ['@tabbridge/shared'],
})
