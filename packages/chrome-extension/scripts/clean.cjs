const fs = require('node:fs')
const path = require('node:path')

for (const name of ['.wxt', 'dist']) {
  const dir = path.join(__dirname, '..', name)
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('clean: removed', dir)
}
