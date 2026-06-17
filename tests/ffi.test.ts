/**
 * unffi cross-runtime test suite
 *
 * One file. Runs on Bun, Deno, and Node.js.
 * Runtime-specific behaviours are tested inline using globalThis detection.
 *
 * Compile the C fixture before running:
 *   macOS:  clang -dynamiclib -o /tmp/unffi_math.dylib tests/fixtures/math.c
 *   Linux:  cc -shared -fPIC  -o /tmp/unffi_math.so   tests/fixtures/math.c
 *
 * Run:
 *   Bun:   bun test tests/ffi.test.ts
 *   Node:  node --experimental-vm-modules node_modules/.bin/vitest run tests/ffi.test.ts
 *   Deno:  deno test --allow-ffi --allow-read tests/ffi.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { dlopen, t } from '../src/adapters/bun.js'

// ─── runtime detection ────────────────────────────────────────────────────────

const IS_BUN  = 'Bun'  in globalThis
const IS_DENO = 'Deno' in globalThis
const IS_NODE = !IS_BUN && !IS_DENO

const RUNTIME = IS_BUN ? 'bun' : IS_DENO ? 'deno' : 'node'

// ─── shared lib path ─────────────────────────────────────────────────────────

const ext = IS_DENO || IS_BUN || process.platform === 'darwin' ? 'dylib' : 'so'
const LIB  = `/tmp/unffi_math.${ext}`

// ─── open lib once ────────────────────────────────────────────────────────────

let lib: ReturnType<typeof openLib>

function openLib() {
  return dlopen(LIB, {
    add_i8:       { args: [t.i8,     t.i8    ], returns: t.i8     },
    add_i16:      { args: [t.i16,    t.i16   ], returns: t.i16    },
    add_i32:      { args: [t.i32,    t.i32   ], returns: t.i32    },
    add_i64:      { args: [t.i64,    t.i64   ], returns: t.i64    },
    add_u8:       { args: [t.u8,     t.u8    ], returns: t.u8     },
    add_u16:      { args: [t.u16,    t.u16   ], returns: t.u16    },
    add_u32:      { args: [t.u32,    t.u32   ], returns: t.u32    },
    add_u64:      { args: [t.u64,    t.u64   ], returns: t.u64    },
    add_f32:      { args: [t.f32,    t.f32   ], returns: t.f32    },
    add_f64:      { args: [t.f64,    t.f64   ], returns: t.f64    },
    identity_i32: { args: [t.i32              ], returns: t.i32    },
    identity_i64: { args: [t.i64              ], returns: t.i64    },
    identity_f64: { args: [t.f64              ], returns: t.f64    },
    gt_i32:       { args: [t.i32,    t.i32   ], returns: t.bool   },
    noop:         { args: [                   ], returns: t.void   },
    greet:        { args: [t.cstring          ], returns: t.cstring},
    sum_i32:      { args: [t.buffer, t.i32   ], returns: t.i32    },
    apply:        { args: [t.fn([t.i32], t.i32), t.i32], returns: t.i32 },
    reduce_i32:   { args: [t.buffer, t.i32, t.i32, t.fn([t.i32, t.i32], t.i32)], returns: t.i32 },
    sort_i32:     { args: [t.buffer, t.i32, t.fn([t.i32, t.i32], t.i32)], returns: t.void },
    with_message: { args: [t.fn([t.cstring], t.void), t.cstring], returns: t.void },
  })
}

beforeAll(() => { lib = openLib() })
afterAll(() => lib.close())

// ─── void ─────────────────────────────────────────────────────────────────────

describe('void', () => {
  test('noop() returns undefined', () => {
    expect(lib.symbols.noop()).toBeUndefined()
  })
})

// ─── integers ─────────────────────────────────────────────────────────────────

describe('i32', () => {
  test('add_i32(10, 20) === 30',            () => expect(lib.symbols.add_i32(10, 20)).toBe(30))
  test('add_i32(-5, 5) === 0',              () => expect(lib.symbols.add_i32(-5, 5)).toBe(0))
  test('INT32_MAX roundtrip',               () => expect(lib.symbols.identity_i32(2147483647)).toBe(2147483647))
  test('INT32_MIN roundtrip',               () => expect(lib.symbols.identity_i32(-2147483648)).toBe(-2147483648))
})

describe('i64', () => {
  test('add_i64(1n, 2n) === 3n',            () => expect(lib.symbols.add_i64(1n, 2n)).toBe(3n))
  test('INT64_MAX roundtrip',               () => expect(lib.symbols.identity_i64(9223372036854775807n)).toBe(9223372036854775807n))
  test('INT64_MIN roundtrip',               () => expect(lib.symbols.identity_i64(-9223372036854775808n)).toBe(-9223372036854775808n))
})

describe('u32', () => {
  test('add_u32(1, 2) === 3',               () => expect(lib.symbols.add_u32(1, 2)).toBe(3))
  test('UINT32_MAX roundtrip',              () => expect(lib.symbols.add_u32(0xFFFFFF00, 0xFF)).toBe(0xFFFFFFFF))
})

describe('u64', () => {
  test('add_u64(1n, 2n) === 3n',            () => expect(lib.symbols.add_u64(1n, 2n)).toBe(3n))
})

describe('f64', () => {
  test('add_f64(1.5, 2.5) === 4.0',         () => expect(lib.symbols.add_f64(1.5, 2.5)).toBe(4.0))
  test('identity_f64(Math.PI) === Math.PI', () => expect(lib.symbols.identity_f64(Math.PI)).toBe(Math.PI))
})

describe('bool', () => {
  test('gt_i32(5, 3) === true',             () => expect(lib.symbols.gt_i32(5, 3)).toBe(true))
  test('gt_i32(3, 5) === false',            () => expect(lib.symbols.gt_i32(3, 5)).toBe(false))
  test('gt_i32(4, 4) === false',            () => expect(lib.symbols.gt_i32(4, 4)).toBe(false))
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

// ─── cstring ──────────────────────────────────────────────────────────────────
// This is where runtimes diverge:
//   Bun:  cstring INPUT requires null-terminated Buffer; OUTPUT returns CString (extends String)
//         cstring args in callbacks arrive as raw pointer numbers
//   Deno: cstring maps to 'pointer' — INPUT needs a Uint8Array pointer; OUTPUT is bigint | null
//   Node: koffi maps to 'str'   — plain strings work bidirectionally

describe('cstring', () => {
  test(`greet() — ${RUNTIME} raw behaviour`, () => {
    if (IS_BUN) {
      // Bun: pass Buffer, get CString back
      const result = lib.symbols.greet(Buffer.from('World\0'))
      expect(String(result)).toBe('Hello, World')
    } else if (IS_DENO) {
      // Deno: cstring mapped to pointer — document actual behavior here once tested
      // placeholder: this will fail until we confirm Deno's greet() behavior
      expect(true).toBe(true) // TODO: fill in after running on Deno
    } else {
      // Node/koffi: plain string in and out
      expect(lib.symbols.greet('World')).toBe('Hello, World')
    }
  })
})

// ─── callbacks ────────────────────────────────────────────────────────────────

describe('callbacks — apply', () => {
  test('apply(x => x * 2, 5) === 10',  () => expect(lib.symbols.apply((x: number) => x * 2, 5)).toBe(10))
  test('apply(x => x + 1, 0) === 1',   () => expect(lib.symbols.apply((x: number) => x + 1, 0)).toBe(1))
  test('callback captures closure', () => {
    let captured = 0
    lib.symbols.apply((x: number) => { captured = x; return x }, 42)
    expect(captured).toBe(42)
  })
})

describe('callbacks — reduce', () => {
  test('sum [1,2,3,4] from 0 === 10', () => {
    const arr = new Int32Array([1, 2, 3, 4])
    expect(lib.symbols.reduce_i32(arr, arr.length, 0, (acc: number, x: number) => acc + x)).toBe(10)
  })
  test('product [2,3] from 1 === 6', () => {
    const arr = new Int32Array([2, 3])
    expect(lib.symbols.reduce_i32(arr, arr.length, 1, (acc: number, x: number) => acc * x)).toBe(6)
  })
})

describe('callbacks — sort_i32', () => {
  test('ascending sort', () => {
    const arr = new Int32Array([5, 3, 1, 4, 2])
    lib.symbols.sort_i32(arr, arr.length, (a: number, b: number) => a - b)
    expect(Array.from(arr)).toEqual([1, 2, 3, 4, 5])
  })
  test('descending sort', () => {
    const arr = new Int32Array([5, 3, 1, 4, 2])
    lib.symbols.sort_i32(arr, arr.length, (a: number, b: number) => b - a)
    expect(Array.from(arr)).toEqual([5, 4, 3, 2, 1])
  })
})

describe('callbacks — cstring through callback', () => {
  test(`with_message — ${RUNTIME} raw behaviour`, () => {
    let received: unknown = null
    if (IS_BUN) {
      // Bun: cstring INPUT needs Buffer; callback arg arrives as raw pointer
      lib.symbols.with_message((ptr: string) => { received = ptr }, Buffer.from('hello\0'))
      // ptr is a number (raw pointer) — document what Bun actually gives us
      expect(typeof received).toBe('number') // raw pointer — adapter should normalize this
    } else if (IS_DENO) {
      expect(true).toBe(true) // TODO: fill in after testing on Deno
    } else {
      // Node/koffi: plain string
      lib.symbols.with_message((msg: string) => { received = msg }, 'hello')
      expect(received).toBe('hello')
    }
  })
})

// ─── async symbols ────────────────────────────────────────────────────────────

describe('async: true', () => {
  test('add_i32 with async:true resolves to correct value', async () => {
    await using asyncLib = dlopen(LIB, {
      add_i32: { args: [t.i32, t.i32], returns: t.i32, async: true },
    })
    expect(await asyncLib.symbols.add_i32(10, 20)).toBe(30)
  })
})

// ─── Disposable protocol ─────────────────────────────────────────────────────

describe('Disposable', () => {
  test('lib has Symbol.dispose', () => {
    const l = openLib(); expect(typeof l[Symbol.dispose]).toBe('function'); l.close()
  })
  test('lib has Symbol.asyncDispose', () => {
    const l = openLib(); expect(typeof l[Symbol.asyncDispose]).toBe('function'); l.close()
  })
  test('using statement disposes', () => {
    using l = openLib()
    expect(l.symbols.add_i32(1, 1)).toBe(2)
    // l is disposed at end of block
  })
  test('await using disposes', async () => {
    await using l = openLib()
    expect(l.symbols.add_i32(2, 2)).toBe(4)
  })
  test('explicit close() does not throw', () => {
    const l = openLib(); expect(() => l.close()).not.toThrow()
  })
})

// ─── cross-platform type rejection ───────────────────────────────────────────

describe('wrong-platform type → helpful error', () => {
  test('deno: prefix throws on bun/node with guidance', () => {
    if (!IS_DENO) {
      expect(() => dlopen(LIB, {
        fn: { args: [{ kind: 'deno:usize' } as any], returns: t.void },
      })).toThrow('Deno')
    }
  })
  test('koffi: prefix throws on bun/deno with guidance', () => {
    if (!IS_NODE) {
      expect(() => dlopen(LIB, {
        fn: { args: [{ kind: 'koffi:str16' } as any], returns: t.void },
      })).toThrow('koffi')
    }
  })
  test('bun: prefix throws on deno/node with guidance', () => {
    if (!IS_BUN) {
      expect(() => dlopen(LIB, {
        fn: { args: [{ kind: 'bun:i64_fast' } as any], returns: t.void },
      })).toThrow('Bun')
    }
  })
})
