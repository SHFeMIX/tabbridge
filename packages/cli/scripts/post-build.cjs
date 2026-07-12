const fs = require('node:fs')
const path = require('node:path')

const cliDir = path.join(__dirname, '..')
const distDir = path.join(cliDir, 'dist')
const cliMainPath = path.join(distDir, 'main.js')
const brokerSourcePath = path.join(cliDir, '..', 'broker', 'dist', 'main.js')
const brokerTargetPath = path.join(distDir, 'broker.js')
const pkgPath = path.join(cliDir, 'package.json')

// 1. Copy the built broker entry into the CLI package so the published bundle
// can spawn it as a detached long-running process.
if (!fs.existsSync(brokerSourcePath)) {
  throw new Error(
    `BROKER_BUILD_MISSING: expected built broker entry at ${brokerSourcePath}; ` +
      'run pnpm --filter @tabbridge/broker build first'
  )
}
fs.copyFileSync(brokerSourcePath, brokerTargetPath)
fs.chmodSync(brokerTargetPath, 0o755)

// 2. Ensure both shipped artifacts are self-contained (no workspace imports).
function assertSelfContained(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  if (/@tabbridge\//.test(text)) {
    throw new Error(
      `NOT_SELF_CONTAINED: ${path.relative(cliDir, filePath)} still imports workspace packages; ` +
        'build with noExternal: ["@tabbridge/broker", "@tabbridge/shared"]'
    )
  }
}
assertSelfContained(brokerTargetPath)
assertSelfContained(cliMainPath)

// 3. Ensure the CLI entry has a shebang so it works as a global bin.
let text = fs.readFileSync(cliMainPath, 'utf8')
if (!text.startsWith('#!')) {
  fs.writeFileSync(cliMainPath, '#!/usr/bin/env node\n' + text)
}
fs.chmodSync(cliMainPath, 0o755)

// 4. Build a publishable package manifest inside dist/ so pnpm can publish
// directly from dist/ without mutating the tracked package.json.
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const publishPkg = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  license: pkg.license,
  bin: { tabbridge: 'main.js' },
  files: ['main.js', 'broker.js', 'README.md', 'README.zh-CN.md', 'LICENSE'],
  dependencies: pkg.dependencies,
}
fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(publishPkg, null, 2) + '\n')

// 5. Copy human-readable metadata files into dist/ so they ship with the tarball.
for (const file of ['README.md', 'README.zh-CN.md', 'LICENSE']) {
  const source = path.join(cliDir, '..', '..', file)
  const target = path.join(distDir, file)
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target)
  }
}

console.log('post-build: prepared dist/ for publishing')
