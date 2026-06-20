import { describe, expect, test } from 'bun:test'

import {
  openKernel32,
  windowsLibraryPaths,
} from '../src/windows.js'

const isWindows = process.platform === 'win32'
const runOnWindows = isWindows ? test : test.skip

describe('Windows system libraries', () => {
  runOnWindows('opens kernel32 and calls stable process/thread/string symbols', async () => {
    await using kernel32 = await openKernel32()

    if (typeof process.pid === 'number') {
      expect(kernel32.symbols.GetCurrentProcessId()).toBe(process.pid)
    }
    expect(kernel32.symbols.GetCurrentThreadId()).toBeGreaterThan(0)
    expect(kernel32.symbols.GetTickCount64()).toBeGreaterThan(0n)
    expect(kernel32.symbols.lstrlenA('hello')).toBe(5)
  })

  runOnWindows('accepts UNFFI_KERNEL32_PATH as a kernel32 override', async () => {
    const original = process.env.UNFFI_KERNEL32_PATH
    process.env.UNFFI_KERNEL32_PATH = windowsLibraryPaths.kernel32.candidates[0]!

    try {
      await using kernel32 = await openKernel32()
      expect(kernel32.symbols.GetCurrentProcessId()).toBe(process.pid)
    } finally {
      if (original === undefined) {
        delete process.env.UNFFI_KERNEL32_PATH
      } else {
        process.env.UNFFI_KERNEL32_PATH = original
      }
    }
  })
})
