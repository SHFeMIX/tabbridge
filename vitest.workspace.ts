import { existsSync } from 'node:fs'
import { defineWorkspace } from 'vitest/config'

const packageProjects = [
  'packages/shared',
  'packages/broker',
  'packages/cli',
  'packages/chrome-extension',
]

export default defineWorkspace(
  packageProjects.filter((project) => existsSync(new URL(project, import.meta.url))),
)
