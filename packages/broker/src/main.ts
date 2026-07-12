#!/usr/bin/env node
import { runBroker } from './run-broker.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function isExecutedEntrypoint(): boolean {
  if (!process.argv[1]) return false
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
}

if (isExecutedEntrypoint()) {
  runBroker().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
