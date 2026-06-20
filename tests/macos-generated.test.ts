import { describe, expect, test } from 'bun:test'
import { openCoreFoundation } from '../src/macos/CoreFoundation.js'
import { openLibSystem } from '../src/macos/libSystem.js'
import { openSecurity } from '../src/macos/Security.js'
import { systemConfigurationSchema } from '../src/macos/SystemConfiguration.js'

const run = process.platform === 'darwin' ? test : test.skip

describe('macOS generated library modules', () => {
  run('imports libSystem subpath and calls stable symbols', async () => {
    await using lib = await openLibSystem()
    expect(lib.symbols.getpid()).toBe(process.pid)
    expect(lib.symbols.strlen('unffi')).toBe(5n)
    expect(lib.symbols.atoi('42')).toBe(42)
  })

  run('imports CoreFoundation subpath and calls stable symbols', async () => {
    await using cf = await openCoreFoundation()
    expect(Number.isFinite(cf.symbols.CFAbsoluteTimeGetCurrent())).toBe(true)
    expect(cf.symbols.CFStringGetTypeID()).toBeGreaterThan(0n)
  })

  run('imports Security subpath and fills random bytes', async () => {
    await using security = await openSecurity()
    const bytes = new Uint8Array(16)
    expect(security.symbols.SecRandomCopyBytes(null, BigInt(bytes.byteLength), bytes)).toBe(0)
    expect(bytes.some(byte => byte !== 0)).toBe(true)
  })

  test('imports SystemConfiguration subpath metadata', () => {
    expect(systemConfigurationSchema.SCDynamicStoreCopyProxies.returns.kind).toBe('pointer')
  })
})
