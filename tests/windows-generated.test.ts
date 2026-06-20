import { describe, expect, test } from 'bun:test'
import { openAdvapi32 } from '../src/windows/advapi32.js'
import { openKernel32 } from '../src/windows/kernel32.js'
import { openUser32 } from '../src/windows/user32.js'

const run = process.platform === 'win32' ? test : test.skip

describe('Windows generated library modules', () => {
  run('imports kernel32 subpath and calls stable symbols', async () => {
    await using kernel32 = await openKernel32()
    expect(kernel32.symbols.GetCurrentProcessId()).toBe(process.pid)
    expect(kernel32.symbols.GetCurrentThreadId()).toBeGreaterThan(0)
    expect(kernel32.symbols.GetTickCount64()).toBeGreaterThan(0n)
    expect(kernel32.symbols.lstrlenA('hello')).toBe(5)
  })

  run('imports advapi32 subpath and reads the current ANSI username', async () => {
    await using advapi32 = await openAdvapi32()
    const name = new Uint8Array(257)
    const size = new Uint32Array([name.byteLength])
    expect(advapi32.symbols.GetUserNameA(name, size)).not.toBe(0)
    expect(size[0]).toBeGreaterThan(1)
  })

  run('imports user32 subpath and calls stable non-UI symbols', async () => {
    await using user32 = await openUser32()
    expect(user32.symbols.GetSystemMetrics(0)).toBeGreaterThan(0)
    expect(user32.symbols.GetDoubleClickTime()).toBeGreaterThan(0)
  })
})
