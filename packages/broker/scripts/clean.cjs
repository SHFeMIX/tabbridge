const fs = require('node:fs')
const path = require('node:path')

const distDir = path.join(__dirname, '..', 'dist')
fs.rmSync(distDir, { recursive: true, force: true })
console.log('clean: removed', distDir)
