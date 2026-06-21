import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateDoctorReport, runDoctor } from '../src/doctor.js'
import { createNativeManifest, nativeManifestPath } from '../src/native-manifest.js'

describe('doctor report evaluation', () => {
  it('reports missing manifest as native_host_missing', () => {
    expect(evaluateDoctorReport({
      manifestExists: false,
      manifestValid: false,
      manifestPathExecutable: false,
      extensionIdExpected: true,
      extensionIdMatches: false,
      socketExists: false,
      bridgeConnected: false,
      protocolCompatible: false,
      nodeMajor: 20,
    })).toMatchObject({
      ok: false,
      bridgeState: 'native_host_missing',
      checks: expect.arrayContaining([{ name: 'native host manifest exists', ok: false }]),
    })
  })

  it('reports extension id mismatch distinctly', () => {
    expect(evaluateDoctorReport({
      manifestExists: true,
      manifestValid: true,
      manifestPathExecutable: true,
      extensionIdExpected: true,
      extensionIdMatches: false,
      socketExists: true,
      bridgeConnected: true,
      protocolCompatible: true,
      nodeMajor: 20,
    })).toMatchObject({
      ok: false,
      bridgeState: 'connected',
      errorCode: 'EXTENSION_ID_MISMATCH',
    })
  })

  it('reports missing expected extension id instead of green extension comparison', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tabbridge-doctor-'))
    const manifestPath = nativeManifestPath('chrome', home)
    const wrapperPath = path.join(home, 'wrapper')
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(wrapperPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    await fs.writeFile(manifestPath, `${JSON.stringify(createNativeManifest({
      extensionId: 'abcdefghijklmnopabcdefghijklmnop',
      wrapperPath,
    }))}\n`)

    const report = await runDoctor({ browser: 'chrome', home })

    expect(report).toMatchObject({
      ok: false,
      errorCode: 'EXTENSION_ID_MISMATCH',
      checks: expect.arrayContaining([
        {
          name: 'expected extension id was provided',
          ok: false,
          detail: 'Pass --extension-id to validate native manifest allowed_origins.',
        },
        { name: 'extension id matches allowed_origins', ok: false },
      ]),
    })
  })
})
