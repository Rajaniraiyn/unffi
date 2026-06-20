import { describe, expect, test } from 'bun:test'
import { libdlSchema } from '../src/linux/libdl.js'
import { openLibc } from '../src/linux/libc.js'
import { openLibm } from '../src/linux/libm.js'
import { openPthread } from '../src/linux/pthread.js'
import { openUnistd } from '../src/linux/unistd.js'

const run = process.platform === 'linux' ? test : test.skip

describe('Linux generated library modules', () => {
  run('imports libc subpath and calls stable symbols', async () => {
    await using libc = await openLibc()
    expect(libc.symbols.getpid()).toBe(process.pid)
    expect(libc.symbols.getppid()).toBeGreaterThan(0)
    expect(libc.symbols.strlen('unffi')).toBe(5n)
    expect(libc.symbols.strcmp('abc', 'abc')).toBe(0)
  })

  run('imports libm subpath and calls stable math symbols', async () => {
    await using libm = await openLibm()
    expect(libm.symbols.sqrt(81)).toBe(9)
    expect(libm.symbols.cos(0)).toBe(1)
    expect(libm.symbols.fabs(-2.5)).toBe(2.5)
  })

  run('imports pthread subpath and calls stable thread symbols', async () => {
    await using pthread = await openPthread()
    const self = pthread.symbols.pthread_self()
    expect(self).toBeGreaterThan(0n)
    expect(pthread.symbols.pthread_equal(self, self)).toBe(1)
  })

  run('imports unistd subpath and calls stable process symbols', async () => {
    await using unistd = await openUnistd()
    expect(unistd.symbols.getppid()).toBeGreaterThan(0)
    expect(unistd.symbols.getuid()).toBeGreaterThanOrEqual(0)
    expect(unistd.symbols.access('/', 0)).toBe(0)
  })

  test('imports libdl subpath metadata', () => {
    expect(libdlSchema.dlerror.returns.kind).toBe('cstring')
  })
})
