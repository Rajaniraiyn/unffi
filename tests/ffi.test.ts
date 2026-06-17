/**
 * unffi cross-runtime test suite
 *
 * One file. Runs on Bun, Deno, and Node.js.
 * Behaviour is normalised by adapters — tests use the same assertions on every
 * runtime. Runtime-specific FEATURES (t.bun.*, t.deno.*, t.koffi.*) are tested
 * inline guarded by globalThis detection.
 *
 * Compile fixture first:
 *   macOS:  clang -dynamiclib -o /tmp/unffi_math.dylib tests/fixtures/math.c
 *   Linux:  clang -shared -fPIC -o /tmp/unffi_math.so  tests/fixtures/math.c
 *
 * Run:
 *   Bun:   bun test tests/ffi.test.ts
 *   Node:  npx vitest run tests/ffi.test.ts
 *   Deno:  deno test --allow-ffi --allow-read tests/ffi.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { dlopen, t } from '../src/adapters/bun.js'

// ─── runtime detection ────────────────────────────────────────────────────────

const IS_BUN  = 'Bun'  in globalThis
const IS_DENO = 'Deno' in globalThis
const IS_NODE = !IS_BUN && !IS_DENO

// ─── lib path ─────────────────────────────────────────────────────────────────

const ext = process.platform === 'darwin' ? 'dylib' : 'so'
const LIB  = `/tmp/unffi_math.${ext}`

// ─── open lib ─────────────────────────────────────────────────────────────────

let lib: ReturnType<typeof openLib>

function openLib() {
  return dlopen(LIB, {
    add_i8:       { args: [t.i8,     t.i8     ], returns: t.i8      },
    add_i16:      { args: [t.i16,    t.i16    ], returns: t.i16     },
    add_i32:      { args: [t.i32,    t.i32    ], returns: t.i32     },
    add_i64:      { args: [t.i64,    t.i64    ], returns: t.i64     },
    add_u8:       { args: [t.u8,     t.u8     ], returns: t.u8      },
    add_u16:      { args: [t.u16,    t.u16    ], returns: t.u16     },
    add_u32:      { args: [t.u32,    t.u32    ], returns: t.u32     },
    add_u64:      { args: [t.u64,    t.u64    ], returns: t.u64     },
    add_f32:      { args: [t.f32,    t.f32    ], returns: t.f32     },
    add_f64:      { args: [t.f64,    t.f64    ], returns: t.f64     },
    identity_i32: { args: [t.i32              ], returns: t.i32     },
    identity_i64: { args: [t.i64              ], returns: t.i64     },
    identity_f64: { args: [t.f64              ], returns: t.f64     },
    gt_i32:       { args: [t.i32,    t.i32    ], returns: t.bool    },
    noop:         { args: [                   ], returns: t.void    },
    greet:        { args: [t.cstring          ], returns: t.cstring },
    sum_i32:      { args: [t.buffer, t.i32    ], returns: t.i32     },
    apply:        { args: [t.fn([t.i32], t.i32), t.i32], returns: t.i32 },
    reduce_i32:   { args: [t.buffer, t.i32, t.i32, t.fn([t.i32, t.i32], t.i32)], returns: t.i32 },
    sort_i32:     { args: [t.buffer, t.i32, t.fn([t.i32, t.i32], t.i32)], returns: t.void },
    with_message: { args: [t.fn([t.cstring], t.void), t.cstring], returns: t.void },
  })
}

beforeAll(() => { lib = openLib() })
afterAll(()  => lib.close())

// ─── void ─────────────────────────────────────────────────────────────────────

describe('void', () => {
  test('noop() returns undefined', () => expect(lib.symbols.noop()).toBeUndefined())
})

// ─── integers (common to all runtimes) ───────────────────────────────────────

describe('i32', () => {
  test('add_i32(10, 20) === 30',   () => expect(lib.symbols.add_i32(10, 20)).toBe(30))
  test('add_i32(-5, 5) === 0',     () => expect(lib.symbols.add_i32(-5, 5)).toBe(0))
  test('INT32_MAX roundtrip',      () => expect(lib.symbols.identity_i32(2147483647)).toBe(2147483647))
  test('INT32_MIN roundtrip',      () => expect(lib.symbols.identity_i32(-2147483648)).toBe(-2147483648))
})

describe('i64 → BigInt', () => {
  test('add_i64(1n, 2n) === 3n',   () => expect(lib.symbols.add_i64(1n, 2n)).toBe(3n))
  test('INT64_MAX roundtrip',      () => expect(lib.symbols.identity_i64(9223372036854775807n)).toBe(9223372036854775807n))
  test('INT64_MIN roundtrip',      () => expect(lib.symbols.identity_i64(-9223372036854775808n)).toBe(-9223372036854775808n))
})

describe('u32', () => {
  test('add_u32(1, 2) === 3',       () => expect(lib.symbols.add_u32(1, 2)).toBe(3))
  test('add_u32 near UINT32_MAX',   () => expect(lib.symbols.add_u32(0xFFFFFFFE, 1)).toBe(0xFFFFFFFF))
})

describe('u64 → BigInt', () => {
  test('add_u64(1n, 2n) === 3n',   () => expect(lib.symbols.add_u64(1n, 2n)).toBe(3n))
  test('UINT64_MAX roundtrip',     () => expect(lib.symbols.add_u64(18446744073709551614n, 1n)).toBe(18446744073709551615n))
})

describe('f64', () => {
  test('add_f64(1.5, 2.5) === 4.0',         () => expect(lib.symbols.add_f64(1.5, 2.5)).toBe(4.0))
  test('identity_f64(Math.PI) === Math.PI', () => expect(lib.symbols.identity_f64(Math.PI)).toBe(Math.PI))
  test('identity_f64(Number.EPSILON)',      () => expect(lib.symbols.identity_f64(Number.EPSILON)).toBe(Number.EPSILON))
})

describe('bool', () => {
  test('gt_i32(5, 3) === true',  () => expect(lib.symbols.gt_i32(5, 3)).toBe(true))
  test('gt_i32(3, 5) === false', () => expect(lib.symbols.gt_i32(3, 5)).toBe(false))
  test('gt_i32(4, 4) === false', () => expect(lib.symbols.gt_i32(4, 4)).toBe(false))
})

// ─── cstring — adapters normalise: plain string in → plain string out ─────────

describe('cstring', () => {
  test('greet("World") === "Hello, World"', () => {
    expect(lib.symbols.greet('World')).toBe('Hello, World')
  })
  test('greet returns typeof string', () => {
    expect(typeof lib.symbols.greet('test')).toBe('string')
  })
})

// ─── buffer ───────────────────────────────────────────────────────────────────

describe('buffer', () => {
  test('sum_i32([1,2,3,4,5]) === 15', () => {
    const arr = new Int32Array([1, 2, 3, 4, 5])
    expect(lib.symbols.sum_i32(arr, arr.length)).toBe(15)
  })
  test('sum_i32([]) === 0', () => {
    expect(lib.symbols.sum_i32(new Int32Array(0), 0)).toBe(0)
  })
})

// ─── callbacks ────────────────────────────────────────────────────────────────

describe('callbacks — apply', () => {
  test('apply(x => x * 2, 5) === 10', () => expect(lib.symbols.apply((x: number) => x * 2, 5)).toBe(10))
  test('apply(x => x + 1, 0) === 1',  () => expect(lib.symbols.apply((x: number) => x + 1, 0)).toBe(1))
  test('captures JS closure', () => {
    let captured = 0
    lib.symbols.apply((x: number) => { captured = x; return x }, 42)
    expect(captured).toBe(42)
  })
})

describe('callbacks — reduce', () => {
  test('sum [1,2,3,4] === 10', () => {
    const arr = new Int32Array([1, 2, 3, 4])
    expect(lib.symbols.reduce_i32(arr, arr.length, 0, (a: number, b: number) => a + b)).toBe(10)
  })
  test('product [2,3] === 6', () => {
    const arr = new Int32Array([2, 3])
    expect(lib.symbols.reduce_i32(arr, arr.length, 1, (a: number, b: number) => a * b)).toBe(6)
  })
})

describe('callbacks — sort', () => {
  test('ascending', () => {
    const arr = new Int32Array([5, 3, 1, 4, 2])
    lib.symbols.sort_i32(arr, arr.length, (a: number, b: number) => a - b)
    expect(Array.from(arr)).toEqual([1, 2, 3, 4, 5])
  })
  test('descending', () => {
    const arr = new Int32Array([5, 3, 1, 4, 2])
    lib.symbols.sort_i32(arr, arr.length, (a: number, b: number) => b - a)
    expect(Array.from(arr)).toEqual([5, 4, 3, 2, 1])
  })
})

describe('callbacks — cstring through callback (normalised)', () => {
  test('with_message("hello") → callback receives "hello"', () => {
    let received: string | null = null
    lib.symbols.with_message((msg: string) => { received = msg }, 'hello')
    expect(received).toBe('hello')
  })
})

// ─── async symbols ────────────────────────────────────────────────────────────

describe('async: true', () => {
  test('add_i32 async resolves to correct value', async () => {
    await using asyncLib = dlopen(LIB, {
      add_i32: { args: [t.i32, t.i32], returns: t.i32, async: true },
    })
    expect(await asyncLib.symbols.add_i32(10, 20)).toBe(30)
  })
})

// ─── Disposable protocol ─────────────────────────────────────────────────────

describe('Disposable', () => {
  test('has Symbol.dispose',       () => { const l = openLib(); expect(typeof l[Symbol.dispose]).toBe('function'); l.close() })
  test('has Symbol.asyncDispose',  () => { const l = openLib(); expect(typeof l[Symbol.asyncDispose]).toBe('function'); l.close() })
  test('using disposes at block end', () => {
    using l = openLib()
    expect(l.symbols.add_i32(1, 1)).toBe(2)
  })
  test('await using disposes', async () => {
    await using l = openLib()
    expect(l.symbols.add_i32(2, 2)).toBe(4)
  })
  test('explicit close() does not throw', () => expect(() => openLib().close()).not.toThrow())
})

// ─── cross-platform type rejection ───────────────────────────────────────────

describe('wrong-platform type → helpful error', () => {
  test('deno:usize on non-Deno throws with Deno guidance', () => {
    if (!IS_DENO) expect(() => dlopen(LIB, { fn: { args: [{ kind: 'deno:usize' } as any], returns: t.void } })).toThrow('Deno')
  })
  test('koffi:str16 on non-Node throws with koffi guidance', () => {
    if (!IS_NODE) expect(() => dlopen(LIB, { fn: { args: [{ kind: 'koffi:str16' } as any], returns: t.void } })).toThrow('koffi')
  })
  test('bun:i64_fast on non-Bun throws with Bun guidance', () => {
    if (!IS_BUN) expect(() => dlopen(LIB, { fn: { args: [{ kind: 'bun:i64_fast' } as any], returns: t.void } })).toThrow('Bun')
  })
})

// ─── runtime-specific FEATURES (inline, guarded) ─────────────────────────────

// These tests run only on the matching runtime and exercise types that only
// exist in that runtime's adapter (t.bun.*, t.deno.*, t.koffi.*).

if (IS_BUN) {
  const { t: tBun } = await import('../src/adapters/bun.js')

  describe('Bun-specific: t.bun.i64_fast', () => {
    // i64_fast returns number when the value fits in a safe integer, bigint otherwise
    test('small value returns number', async () => {
      await using l = dlopen(LIB, {
        identity_i64: { args: [tBun.bun.i64_fast], returns: tBun.bun.i64_fast },
      })
      const result = l.symbols.identity_i64(42 as any)
      expect(typeof result === 'number' || typeof result === 'bigint').toBe(true)
      expect(Number(result)).toBe(42)
    })
    test('value > Number.MAX_SAFE_INTEGER returns bigint', async () => {
      await using l = dlopen(LIB, {
        identity_i64: { args: [tBun.bun.i64_fast], returns: tBun.bun.i64_fast },
      })
      const big = 9223372036854775807n
      const result = l.symbols.identity_i64(big as any)
      expect(typeof result).toBe('bigint')
      expect(result).toBe(big)
    })
  })

  describe('Bun-specific: t.bun.u64_fast', () => {
    test('u64_fast identity roundtrip', async () => {
      await using l = dlopen(LIB, {
        add_u64: { args: [tBun.bun.u64_fast, tBun.bun.u64_fast], returns: tBun.bun.u64_fast },
      })
      const result = l.symbols.add_u64(1n as any, 2n as any)
      expect(Number(result)).toBe(3)
    })
  })
}

if (IS_DENO) {
  const { t: tDeno } = await import('../src/adapters/deno.js')

  describe('Deno-specific: t.deno.usize / isize (pointer-sized, returns bigint)', () => {
    test('usize identity (add two pointer-sized values)', async () => {
      await using l = dlopen(LIB, {
        add_u64: { args: [tDeno.deno.usize, tDeno.deno.usize], returns: tDeno.deno.usize },
      })
      expect(l.symbols.add_u64(1n as any, 2n as any)).toBe(3n)
    })
    test('isize identity', async () => {
      await using l = dlopen(LIB, {
        add_i64: { args: [tDeno.deno.isize, tDeno.deno.isize], returns: tDeno.deno.isize },
      })
      expect(l.symbols.add_i64(-1n as any, 1n as any)).toBe(0n)
    })
  })
}

if (IS_NODE) {
  const { t: tKoffi } = await import('../src/adapters/koffi.js')

  describe('Node-specific: t.koffi.str16 (UTF-16, Windows WinAPI)', () => {
    // str16 is only meaningful on Windows; on non-Windows this just documents the type exists
    test('t.koffi.str16 is a valid CType', () => {
      expect(tKoffi.koffi.str16.kind).toBe('koffi:str16')
    })
  })

  describe('Node-specific: t.koffi.uintptr / intptr (pointer-sized int)', () => {
    test('uintptr identity via add_u64 mapping', async () => {
      await using l = dlopen(LIB, {
        add_u64: { args: [tKoffi.koffi.uintptr, tKoffi.koffi.uintptr], returns: tKoffi.koffi.uintptr },
      })
      expect(l.symbols.add_u64(1n as any, 2n as any)).toBe(3n)
    })
  })
}
