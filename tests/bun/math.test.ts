import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { dlopen, t } from '../../src/adapters/bun.js'
import { compileC, fixturePath, tmpLib } from '../helpers/compile.js'

const LIB = tmpLib('math')

let lib: ReturnType<typeof openLib>

function openLib() {
  return dlopen(LIB, {
    // Arithmetic — every integer and float type
    add_i8:  { args: [t.i8,  t.i8],  returns: t.i8  },
    add_i16: { args: [t.i16, t.i16], returns: t.i16 },
    add_i32: { args: [t.i32, t.i32], returns: t.i32 },
    add_i64: { args: [t.i64, t.i64], returns: t.i64 },
    add_u8:  { args: [t.u8,  t.u8],  returns: t.u8  },
    add_u16: { args: [t.u16, t.u16], returns: t.u16 },
    add_u32: { args: [t.u32, t.u32], returns: t.u32 },
    add_u64: { args: [t.u64, t.u64], returns: t.u64 },
    add_f32: { args: [t.f32, t.f32], returns: t.f32 },
    add_f64: { args: [t.f64, t.f64], returns: t.f64 },

    // Comparisons
    gt_i32:      { args: [t.i32, t.i32], returns: t.bool },
    is_zero_f64: { args: [t.f64],         returns: t.bool },

    // String
    greet: { args: [t.cstring], returns: t.cstring },

    // Void
    noop: { args: [], returns: t.void },

    // Buffer
    sum_i32: { args: [t.buffer, t.i32], returns: t.i32 },

    // Identity functions for boundary/overflow checks
    identity_i8:   { args: [t.i8],  returns: t.i8  },
    identity_i16:  { args: [t.i16], returns: t.i16 },
    identity_i32:  { args: [t.i32], returns: t.i32 },
    identity_i64:  { args: [t.i64], returns: t.i64 },
    identity_u8:   { args: [t.u8],  returns: t.u8  },
    identity_u16:  { args: [t.u16], returns: t.u16 },
    identity_u32:  { args: [t.u32], returns: t.u32 },
    identity_u64:  { args: [t.u64], returns: t.u64 },
    identity_f32:  { args: [t.f32], returns: t.f32 },
    identity_f64:  { args: [t.f64], returns: t.f64 },
    identity_bool: { args: [t.bool], returns: t.bool },
  })
}

beforeAll(async () => {
  await compileC(fixturePath('math.c'), LIB)
  lib = openLib()
})

afterAll(() => {
  lib.close()
})

// ─── void ─────────────────────────────────────────────────────────────────────

describe('void', () => {
  test('noop() returns undefined', () => {
    expect(lib.symbols.noop()).toBeUndefined()
  })

  test('noop() can be called multiple times safely', () => {
    for (let i = 0; i < 10; i++) lib.symbols.noop()
  })
})

// ─── bool ─────────────────────────────────────────────────────────────────────

describe('bool', () => {
  test('gt_i32(5, 3) === true', () => {
    expect(lib.symbols.gt_i32(5, 3)).toBe(true)
  })

  test('gt_i32(3, 5) === false', () => {
    expect(lib.symbols.gt_i32(3, 5)).toBe(false)
  })

  test('gt_i32(4, 4) === false (equal)', () => {
    expect(lib.symbols.gt_i32(4, 4)).toBe(false)
  })

  test('is_zero_f64(0.0) === true', () => {
    expect(lib.symbols.is_zero_f64(0.0)).toBe(true)
  })

  test('is_zero_f64(1e-300) === false', () => {
    expect(lib.symbols.is_zero_f64(1e-300)).toBe(false)
  })

  test('identity_bool(true) === true', () => {
    expect(lib.symbols.identity_bool(true)).toBe(true)
  })

  test('identity_bool(false) === false', () => {
    expect(lib.symbols.identity_bool(false)).toBe(false)
  })
})

// ─── i8 ───────────────────────────────────────────────────────────────────────

describe('i8', () => {
  test('add_i8(1, 2) === 3', () => {
    expect(lib.symbols.add_i8(1, 2)).toBe(3)
  })

  test('identity_i8(0) === 0', () => {
    expect(lib.symbols.identity_i8(0)).toBe(0)
  })

  test('identity_i8(127) === 127 — INT8_MAX', () => {
    expect(lib.symbols.identity_i8(127)).toBe(127)
  })

  test('identity_i8(-128) === -128 — INT8_MIN', () => {
    expect(lib.symbols.identity_i8(-128)).toBe(-128)
  })

  test('identity_i8(-1) === -1', () => {
    expect(lib.symbols.identity_i8(-1)).toBe(-1)
  })

  test('identity_i8(128) wraps to -128 — C modular overflow', () => {
    // 128 overflows i8; C semantics wrap to -128
    expect(lib.symbols.identity_i8(128)).toBe(-128)
  })

  test('identity_i8(-129) wraps to 127 — C modular underflow', () => {
    expect(lib.symbols.identity_i8(-129)).toBe(127)
  })
})

// ─── i16 ──────────────────────────────────────────────────────────────────────

describe('i16', () => {
  test('add_i16(100, 200) === 300', () => {
    expect(lib.symbols.add_i16(100, 200)).toBe(300)
  })

  test('identity_i16(32767) === 32767 — INT16_MAX', () => {
    expect(lib.symbols.identity_i16(32767)).toBe(32767)
  })

  test('identity_i16(-32768) === -32768 — INT16_MIN', () => {
    expect(lib.symbols.identity_i16(-32768)).toBe(-32768)
  })

  test('identity_i16(-1) === -1', () => {
    expect(lib.symbols.identity_i16(-1)).toBe(-1)
  })

  // Out-of-range truncation is implementation-defined in C; behaviour varies by runtime/platform
})

// ─── i32 ──────────────────────────────────────────────────────────────────────

describe('i32', () => {
  test('add_i32(10, 20) === 30', () => {
    expect(lib.symbols.add_i32(10, 20)).toBe(30)
  })

  test('add_i32(-5, 5) === 0', () => {
    expect(lib.symbols.add_i32(-5, 5)).toBe(0)
  })

  test('identity_i32(0) === 0', () => {
    expect(lib.symbols.identity_i32(0)).toBe(0)
  })

  test('identity_i32(2147483647) === 2147483647 — INT32_MAX', () => {
    expect(lib.symbols.identity_i32(2147483647)).toBe(2147483647)
  })

  test('identity_i32(-2147483648) === -2147483648 — INT32_MIN', () => {
    expect(lib.symbols.identity_i32(-2147483648)).toBe(-2147483648)
  })

  test('identity_i32(-1) === -1', () => {
    expect(lib.symbols.identity_i32(-1)).toBe(-1)
  })

  test('identity_i32(2147483648) wraps to -2147483648 — C modular overflow', () => {
    expect(lib.symbols.identity_i32(2147483648)).toBe(-2147483648)
  })

  test('identity_i32(-2147483649) wraps to 2147483647 — C modular underflow', () => {
    expect(lib.symbols.identity_i32(-2147483649)).toBe(2147483647)
  })

  test('identity_i32 with Number.MAX_SAFE_INTEGER does not throw', () => {
    expect(() => lib.symbols.identity_i32(Number.MAX_SAFE_INTEGER)).not.toThrow()
  })
})

// ─── i64 ──────────────────────────────────────────────────────────────────────

describe('i64', () => {
  test('add_i64(1n, 2n) === 3n', () => {
    expect(lib.symbols.add_i64(1n, 2n)).toBe(3n)
  })

  test('add_i64(-5n, 5n) === 0n', () => {
    expect(lib.symbols.add_i64(-5n, 5n)).toBe(0n)
  })

  test('identity_i64(0n) === 0n', () => {
    expect(lib.symbols.identity_i64(0n)).toBe(0n)
  })

  test('identity_i64(9223372036854775807n) === 9223372036854775807n — INT64_MAX', () => {
    expect(lib.symbols.identity_i64(9223372036854775807n)).toBe(9223372036854775807n)
  })

  test('identity_i64(-9223372036854775808n) === -9223372036854775808n — INT64_MIN', () => {
    expect(lib.symbols.identity_i64(-9223372036854775808n)).toBe(-9223372036854775808n)
  })

  test('identity_i64(-1n) === -1n', () => {
    expect(lib.symbols.identity_i64(-1n)).toBe(-1n)
  })
})

// ─── u8 ───────────────────────────────────────────────────────────────────────

describe('u8', () => {
  test('add_u8(100, 55) === 155', () => {
    expect(lib.symbols.add_u8(100, 55)).toBe(155)
  })

  test('identity_u8(0) === 0', () => {
    expect(lib.symbols.identity_u8(0)).toBe(0)
  })

  test('identity_u8(255) === 255 — UINT8_MAX', () => {
    expect(lib.symbols.identity_u8(255)).toBe(255)
  })

  // Out-of-range truncation is implementation-defined; behaviour varies by runtime/platform
})

// ─── u16 ──────────────────────────────────────────────────────────────────────

describe('u16', () => {
  test('add_u16(1000, 2000) === 3000', () => {
    expect(lib.symbols.add_u16(1000, 2000)).toBe(3000)
  })

  test('identity_u16(0) === 0', () => {
    expect(lib.symbols.identity_u16(0)).toBe(0)
  })

  test('identity_u16(65535) === 65535 — UINT16_MAX', () => {
    expect(lib.symbols.identity_u16(65535)).toBe(65535)
  })
})

// ─── u32 ──────────────────────────────────────────────────────────────────────

describe('u32', () => {
  test('add_u32(1000000, 2000000) === 3000000', () => {
    expect(lib.symbols.add_u32(1000000, 2000000)).toBe(3000000)
  })

  test('identity_u32(0) === 0', () => {
    expect(lib.symbols.identity_u32(0)).toBe(0)
  })

  test('identity_u32(4294967295) — UINT32_MAX', () => {
    expect(lib.symbols.identity_u32(4294967295)).toBe(4294967295)
  })
})

// ─── u64 ──────────────────────────────────────────────────────────────────────

describe('u64', () => {
  test('add_u64(1n, 2n) === 3n', () => {
    expect(lib.symbols.add_u64(1n, 2n)).toBe(3n)
  })

  test('identity_u64(0n) === 0n', () => {
    expect(lib.symbols.identity_u64(0n)).toBe(0n)
  })

  test('identity_u64(18446744073709551615n) — UINT64_MAX', () => {
    expect(lib.symbols.identity_u64(18446744073709551615n)).toBe(18446744073709551615n)
  })
})

// ─── f32 ──────────────────────────────────────────────────────────────────────

describe('f32', () => {
  test('add_f32(1.0, 2.0) is approximately 3.0', () => {
    expect(lib.symbols.add_f32(1.0, 2.0)).toBeCloseTo(3.0, 5)
  })

  test('add_f32(0.1, 0.2) is close to 0.3 within f32 precision', () => {
    expect(lib.symbols.add_f32(0.1, 0.2)).toBeCloseTo(0.3, 5)
  })

  test('identity_f32(0.0) === 0', () => {
    expect(lib.symbols.identity_f32(0.0)).toBe(0)
  })

  test('identity_f32(-1.5) is approximately -1.5', () => {
    expect(lib.symbols.identity_f32(-1.5)).toBeCloseTo(-1.5, 5)
  })
})

// ─── f64 ──────────────────────────────────────────────────────────────────────

describe('f64', () => {
  test('add_f64(1.0, 2.0) === 3.0', () => {
    expect(lib.symbols.add_f64(1.0, 2.0)).toBe(3.0)
  })

  test('add_f64(-10.5, 10.5) === 0.0', () => {
    expect(lib.symbols.add_f64(-10.5, 10.5)).toBe(0.0)
  })

  test('identity_f64(Math.PI) === Math.PI', () => {
    expect(lib.symbols.identity_f64(Math.PI)).toBe(Math.PI)
  })

  test('identity_f64(Number.EPSILON) === Number.EPSILON', () => {
    expect(lib.symbols.identity_f64(Number.EPSILON)).toBe(Number.EPSILON)
  })

  test('identity_f64(Number.MAX_VALUE) === Number.MAX_VALUE', () => {
    expect(lib.symbols.identity_f64(Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
  })
})

// ─── cstring ──────────────────────────────────────────────────────────────────

// Bun FFI requires a null-terminated Buffer for cstring INPUT args.
// cstring OUTPUT (return value) is automatically decoded to a JS string.
// Bun FFI requires a null-terminated Buffer for cstring INPUT args.
// cstring OUTPUT returns Bun's CString (extends String) — use .toString() for primitives.
describe('cstring', () => {
  test('greet("World") returns "Hello, World"', () => {
    expect(lib.symbols.greet(Buffer.from('World\0')).toString()).toBe('Hello, World')
  })

  test('greet("Bun") returns "Hello, Bun"', () => {
    expect(lib.symbols.greet(Buffer.from('Bun\0')).toString()).toBe('Hello, Bun')
  })

  test('greet returns a string-like value', () => {
    const result = lib.symbols.greet(Buffer.from('test\0'))
    // CString extends String — coerce to primitive for comparison
    expect(result.toString()).toContain('test')
  })
})

// ─── buffer ───────────────────────────────────────────────────────────────────

describe('buffer (sum_i32)', () => {
  test('sum_i32 of [1, 2, 3, 4, 5] === 15', () => {
    const arr = new Int32Array([1, 2, 3, 4, 5])
    expect(lib.symbols.sum_i32(arr, arr.length)).toBe(15)
  })

  test('sum_i32 of empty array === 0', () => {
    const arr = new Int32Array(0)
    expect(lib.symbols.sum_i32(arr, 0)).toBe(0)
  })

  test('sum_i32 with negative values', () => {
    const arr = new Int32Array([-10, 20, -5, 5])
    expect(lib.symbols.sum_i32(arr, arr.length)).toBe(10)
  })

  test('sum_i32 with single element', () => {
    const arr = new Int32Array([42])
    expect(lib.symbols.sum_i32(arr, 1)).toBe(42)
  })
})
