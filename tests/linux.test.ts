import { describe, expect, test } from 'bun:test'

import {
  linuxLibraryPaths,
  openLibc,
  openLibm,
} from '../src/linux.js'

const isLinux = process.platform === 'linux'
const runOnLinux = isLinux ? test : test.skip

describe('linux system libraries', () => {
  runOnLinux('opens libc and calls stable process/string symbols', async () => {
    await using libc = await openLibc()

    const pid = libc.symbols.getpid()
    expect(pid).toBe(process.pid)
    expect(libc.symbols.strlen('unffi')).toBe(5n)
    expect(libc.symbols.strcmp('unffi', 'unffi')).toBe(0)
    expect(libc.symbols.strcmp('abc', 'abd')).toBeLessThan(0)
    expect(libc.symbols.strcmp('abd', 'abc')).toBeGreaterThan(0)
  })

  runOnLinux('opens libm and calls stable math symbols', async () => {
    await using libm = await openLibm()

    expect(libm.symbols.sqrt(81)).toBe(9)
    expect(libm.symbols.cos(0)).toBe(1)
  })

  runOnLinux('accepts UNFFI_LIBC_PATH as a libc override', async () => {
    const original = process.env.UNFFI_LIBC_PATH
    process.env.UNFFI_LIBC_PATH = linuxLibraryPaths.libc.bare

    try {
      await using libc = await openLibc()
      expect(libc.symbols.getpid()).toBe(process.pid)
    } finally {
      if (original === undefined) {
        delete process.env.UNFFI_LIBC_PATH
      } else {
        process.env.UNFFI_LIBC_PATH = original
      }
    }
  })
})
