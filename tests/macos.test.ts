import { describe, expect, test } from 'bun:test'

import {
  macosLibraryPaths,
  openCoreFoundation,
  openLibSystem,
} from '../src/macos.js'

const isMacOS = process.platform === 'darwin'
const runOnMacOS = isMacOS ? test : test.skip

describe('macOS system libraries', () => {
  runOnMacOS('opens libSystem and calls stable process/string symbols', async () => {
    await using libSystem = await openLibSystem()

    expect(libSystem.symbols.getpid()).toBe(process.pid)
    expect(libSystem.symbols.strlen('unffi')).toBe(5n)
    expect(libSystem.symbols.strcmp('unffi', 'unffi')).toBe(0)
    expect(libSystem.symbols.strcmp('abc', 'abd')).toBeLessThan(0)
    expect(libSystem.symbols.strcmp('abd', 'abc')).toBeGreaterThan(0)
    expect(libSystem.symbols.atoi('42')).toBe(42)
  })

  runOnMacOS('opens CoreFoundation and calls stable symbols', async () => {
    await using coreFoundation = await openCoreFoundation()

    const now = coreFoundation.symbols.CFAbsoluteTimeGetCurrent()
    expect(Number.isFinite(now)).toBe(true)
    expect(now).toBeGreaterThan(0)
    expect(coreFoundation.symbols.CFStringGetTypeID()).not.toBe(0n)
  })

  runOnMacOS('accepts UNFFI_LIBSYSTEM_PATH as a libSystem override', async () => {
    const original = process.env.UNFFI_LIBSYSTEM_PATH
    process.env.UNFFI_LIBSYSTEM_PATH = macosLibraryPaths.libSystem.candidates[0]!

    try {
      await using libSystem = await openLibSystem()
      expect(libSystem.symbols.getpid()).toBe(process.pid)
    } finally {
      if (original === undefined) {
        delete process.env.UNFFI_LIBSYSTEM_PATH
      } else {
        process.env.UNFFI_LIBSYSTEM_PATH = original
      }
    }
  })
})
