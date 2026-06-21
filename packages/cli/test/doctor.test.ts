import { describe, expect, it } from 'vitest'
import { evaluateDoctorReport } from '../src/doctor.js'

describe('doctor report evaluation', () => {
  it('reports missing manifest as native_host_missing', () => {
    expect(evaluateDoctorReport({
      manifestExists: false,
      manifestValid: false,
      manifestPathExecutable: false,
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
})
