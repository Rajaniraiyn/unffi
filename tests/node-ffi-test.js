import { describe, test, before, after } from 'node:test'
import assert from 'node:assert'
import { dlopen, t } from '../dist/adapters/node.js'

const LIB = `/tmp/unffi_math.${process.platform === 'darwin' ? 'dylib' : 'so'}`

let lib

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

before(() => { lib = openLib() })
after(()  => lib.close())

describe('void', () => {
  test('noop() returns undefined', () => assert.strictEqual(lib.symbols.noop(), undefined))
})

describe('i32', () => {
  test('add_i32(10, 20) === 30',   () => assert.strictEqual(lib.symbols.add_i32(10, 20), 30))
  test('add_i32(-5, 5) === 0',     () => assert.strictEqual(lib.symbols.add_i32(-5, 5), 0))
  test('INT32_MAX roundtrip',      () => assert.strictEqual(lib.symbols.identity_i32(2147483647), 2147483647))
  test('INT32_MIN roundtrip',      () => assert.strictEqual(lib.symbols.identity_i32(-2147483648), -2147483648))
})

describe('i64 → BigInt', () => {
  // koffi returns number when value fits (like i64_fast); node:ffi always returns bigint
  test('add_i64(1n, 2n) === 3n',   () => assert.strictEqual(Number(lib.symbols.add_i64(1n, 2n)), 3))
  test('INT64_MAX roundtrip',      () => assert.strictEqual(Number(lib.symbols.identity_i64(9223372036854775807n)), 9223372036854775807))
  test('INT64_MIN roundtrip',      () => assert.strictEqual(Number(lib.symbols.identity_i64(-9223372036854775808n)), -9223372036854775808))
})

describe('u32', () => {
  test('add_u32(1, 2) === 3',       () => assert.strictEqual(lib.symbols.add_u32(1, 2), 3))
  test('add_u32 near UINT32_MAX',   () => assert.strictEqual(lib.symbols.add_u32(0xFFFFFFFE, 1), 0xFFFFFFFF))
})

describe('u64 → BigInt', () => {
  test('add_u64(1n, 2n) === 3n',   () => assert.strictEqual(Number(lib.symbols.add_u64(1n, 2n)), 3))
  test('UINT64_MAX roundtrip',     () => assert.strictEqual(Number(lib.symbols.add_u64(18446744073709551614n, 1n)), 18446744073709551615))
})

describe('f64', () => {
  test('add_f64(1.5, 2.5) === 4.0',         () => assert.strictEqual(lib.symbols.add_f64(1.5, 2.5), 4.0))
  test('identity_f64(Math.PI) === Math.PI', () => assert.strictEqual(lib.symbols.identity_f64(Math.PI), Math.PI))
})

describe('bool', () => {
  test('gt_i32(5, 3) === true',  () => assert.strictEqual(lib.symbols.gt_i32(5, 3), true))
  test('gt_i32(3, 5) === false', () => assert.strictEqual(lib.symbols.gt_i32(3, 5), false))
  test('gt_i32(4, 4) === false', () => assert.strictEqual(lib.symbols.gt_i32(4, 4), false))
})

describe('cstring', () => {
  test('greet("World") === "Hello, World"', () => {
    assert.strictEqual(lib.symbols.greet('World'), 'Hello, World')
  })
  test('greet returns typeof string', () => {
    assert.strictEqual(typeof lib.symbols.greet('test'), 'string')
  })
})

describe('buffer', () => {
  test('sum_i32([1,2,3,4,5]) === 15', () => {
    const arr = new Int32Array([1, 2, 3, 4, 5])
    assert.strictEqual(lib.symbols.sum_i32(arr, arr.length), 15)
  })
  test('sum_i32([]) === 0', () => {
    assert.strictEqual(lib.symbols.sum_i32(new Int32Array(0), 0), 0)
  })
})

describe('callbacks — apply', () => {
  test('apply(x => x * 2, 5) === 10', () => assert.strictEqual(lib.symbols.apply(x => x * 2, 5), 10))
  test('apply(x => x + 1, 0) === 1',  () => assert.strictEqual(lib.symbols.apply(x => x + 1, 0), 1))
  test('captures JS closure', () => {
    let captured = 0
    lib.symbols.apply(x => { captured = x; return x }, 42)
    assert.strictEqual(captured, 42)
  })
})

describe('callbacks — reduce', () => {
  test('sum [1,2,3,4] === 10', () => {
    const arr = new Int32Array([1, 2, 3, 4])
    assert.strictEqual(lib.symbols.reduce_i32(arr, arr.length, 0, (a, b) => a + b), 10)
  })
  test('product [2,3] === 6', () => {
    const arr = new Int32Array([2, 3])
    assert.strictEqual(lib.symbols.reduce_i32(arr, arr.length, 1, (a, b) => a * b), 6)
  })
})

describe('callbacks — sort', () => {
  test('ascending', () => {
    const arr = new Int32Array([5, 3, 1, 4, 2])
    lib.symbols.sort_i32(arr, arr.length, (a, b) => a - b)
    assert.deepStrictEqual(Array.from(arr), [1, 2, 3, 4, 5])
  })
  test('descending', () => {
    const arr = new Int32Array([5, 3, 1, 4, 2])
    lib.symbols.sort_i32(arr, arr.length, (a, b) => b - a)
    assert.deepStrictEqual(Array.from(arr), [5, 4, 3, 2, 1])
  })
})

describe('callbacks — cstring through callback', () => {
  test('with_message("hello") → callback receives "hello"', () => {
    let received = null
    lib.symbols.with_message(msg => { received = msg }, 'hello')
    assert.strictEqual(received, 'hello')
  })
})

describe('async: true', () => {
  test('add_i32 async resolves to correct value', async () => {
    const asyncLib = dlopen(LIB, {
      add_i32: { args: [t.i32, t.i32], returns: t.i32, async: true },
    })
    assert.strictEqual(await asyncLib.symbols.add_i32(10, 20), 30)
    asyncLib.close()
  })
})

describe('Disposable', () => {
  test('has Symbol.dispose',       () => { const l = openLib(); assert.strictEqual(typeof l[Symbol.dispose], 'function'); l.close() })
  test('has Symbol.asyncDispose',  () => { const l = openLib(); assert.strictEqual(typeof l[Symbol.asyncDispose], 'function'); l.close() })
  test('explicit close() does not throw', () => assert.doesNotThrow(() => openLib().close()))
  test('double close() is a no-op (idempotent)', () => {
    const l = openLib()
    l.close()
    assert.doesNotThrow(() => l.close())
  })
})

describe('koffi compatibility types via node adapter', () => {
  test('t.koffi.str16 is a valid CType', () => {
    assert.strictEqual(t.koffi.str16.kind, 'koffi:str16')
  })
  test('uintptr identity via add_u64 mapping', () => {
    const l = dlopen(LIB, {
      add_u64: { args: [t.koffi.uintptr, t.koffi.uintptr], returns: t.koffi.uintptr },
    })
    assert.strictEqual(Number(l.symbols.add_u64(1n, 2n)), 3)
    l.close()
  })
})
