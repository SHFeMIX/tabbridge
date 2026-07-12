import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cliDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(cliDir, 'dist')
const mainPath = path.join(distDir, 'main.js')
const brokerPath = path.join(distDir, 'broker.js')

describe('CLI build integrity', () => {
  it('ships a self-contained main.js with a shebang', () => {
    const text = fs.readFileSync(mainPath, 'utf8')
    expect(text.startsWith('#!/usr/bin/env node')).toBe(true)
    expect(text).not.toMatch(/@tabbridge\//)
  })

  it('ships a self-contained broker.js next to main.js', () => {
    expect(fs.existsSync(brokerPath)).toBe(true)
    const text = fs.readFileSync(brokerPath, 'utf8')
    expect(text).not.toMatch(/@tabbridge\//)
  })

  it('marks shipped entry files as executable on Unix-like systems', () => {
    if (process.platform === 'win32') {
      // Windows does not use Unix permission bits for executability.
      return
    }
    for (const p of [mainPath, brokerPath]) {
      const mode = fs.statSync(p).mode
      expect(mode & 0o111).not.toBe(0)
    }
  })

  it('prepares a publishable dist/package.json with only runtime dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(distDir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('tabbridge')
    expect(pkg.bin).toEqual({ tabbridge: 'main.js' })
    expect(pkg.files).toEqual([
      'main.js',
      'broker.js',
      'README.md',
      'README.zh-CN.md',
      'LICENSE',
    ])
    expect(pkg.dependencies).toEqual({
      'env-paths': '^4.0.0',
      'proper-lockfile': '^4.1.2',
      ws: '^8.18.0',
    })
    expect(pkg.devDependencies).toBeUndefined()
    expect(pkg.scripts).toBeUndefined()
  })

  it('copies README and LICENSE into dist/', () => {
    expect(fs.existsSync(path.join(distDir, 'README.md'))).toBe(true)
    expect(fs.existsSync(path.join(distDir, 'LICENSE'))).toBe(true)
  })
})
