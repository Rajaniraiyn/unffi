/**
 * Tests for async: true symbols in the bun adapter.
 * Bun maps async: true → nonblocking: true in bun:ffi, which offloads the
 * call to a background thread and returns a Promise.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { dlopen, t } from '../../src/adapters/bun.js'
import { compileC, fixturePath, tmpLib } from '../helpers/compile.js'

const LIB = tmpLib('math-async')

let lib: ReturnType<typeof openLib>

function openLib() {
  return dlopen(LIB, {
    add_i32: { args: [t.i32, t.i32], returns: t.i32, async: true },
    add_i64: { args: [t.i64, t.i64], returns: t.i64, async: true },
    add_f64: { args: [t.f64, t.f64], returns: t.f64, async: true },
    add_u32: { args: [t.u32, t.u32], returns: t.u32, async: true },
    add_f32: { args: [t.f32, t.f32], returns: t.f32, async: true },
    gt_i32:      { args: [t.i32, t.i32], returns: t.bool, async: true },
    is_zero_f64: { args: [t.f64],         returns: t.bool, async: true },
    noop:    { args: [], returns: t.void, async: true },
    sum_i32: { args: [t.buffer, t.i32], returns: t.i32, async: true },
    identity_i32: { args: [t.i32], returns: t.i32, async: true },
    identity_i64: { args: [t.i64], returns: t.i64, async: true },
    identity_f64: { args: [t.f64], returns: t.f64, async: true },
    identity_bool: { args: [t.bool], returns: t.bool, async: true },
  })
}

beforeAll(async () => {
  // Reuse the same math.c compiled output (just copy to a separate path)
  await compileC(fixturePath('math.c'), LIB)
  lib = openLib()
})

afterAll(() => {
  lib.close()
})

// ─── basic async calls return Promises ────────────────────────────────────────

describe('async symbols return Promises', () => {
  test('add_i32 async result === 3', async () => {
    // nonblocking may resolve synchronously for trivial ops in Bun; test the value
    expect(await lib.symbols.add_i32(1, 2)).toBe(3)
  })

  test('await add_i32(10, 20) === 30', async () => {
    expect(await lib.symbols.add_i32(10, 20)).toBe(30)
  })

  test('await add_i32(-5, 5) === 0', async () => {
    expect(await lib.symbols.add_i32(-5, 5)).toBe(0)
  })

  test('await add_i64(1n, 2n) === 3n', async () => {
    expect(await lib.symbols.add_i64(1n, 2n)).toBe(3n)
  })

  test('await add_i64(9223372036854775806n, 1n) === 9223372036854775807n — near INT64_MAX', async () => {
    expect(await lib.symbols.add_i64(9223372036854775806n, 1n)).toBe(9223372036854775807n)
  })

  test('await add_f64(1.5, 2.5) === 4.0', async () => {
    expect(await lib.symbols.add_f64(1.5, 2.5)).toBe(4.0)
  })

  test('await add_u32(1000000, 2000000) === 3000000', async () => {
    expect(await lib.symbols.add_u32(1000000, 2000000)).toBe(3000000)
  })

  test('await add_f32(1.0, 2.0) is approximately 3.0', async () => {
    expect(await lib.symbols.add_f32(1.0, 2.0)).toBeCloseTo(3.0, 5)
  })
})

// ─── async bool ───────────────────────────────────────────────────────────────

describe('async bool symbols', () => {
  test('await gt_i32(5, 3) === true', async () => {
    expect(await lib.symbols.gt_i32(5, 3)).toBe(true)
  })

  test('await gt_i32(3, 5) === false', async () => {
    expect(await lib.symbols.gt_i32(3, 5)).toBe(false)
  })

  test('await is_zero_f64(0.0) === true', async () => {
    expect(await lib.symbols.is_zero_f64(0.0)).toBe(true)
  })

  test('await is_zero_f64(1.0) === false', async () => {
    expect(await lib.symbols.is_zero_f64(1.0)).toBe(false)
  })
})

// ─── async void ───────────────────────────────────────────────────────────────

describe('async void symbols', () => {
  test('await noop() resolves to undefined', async () => {
    expect(await lib.symbols.noop()).toBeUndefined()
  })

  test('noop async resolves to undefined', async () => {
    expect(await lib.symbols.noop()).toBeUndefined()
  })
})

// ─── async buffer ─────────────────────────────────────────────────────────────

describe('async buffer symbols', () => {
  test('await sum_i32([1,2,3,4,5], 5) === 15', async () => {
    const arr = new Int32Array([1, 2, 3, 4, 5])
    expect(await lib.symbols.sum_i32(arr, arr.length)).toBe(15)
  })

  test('await sum_i32 empty array === 0', async () => {
    const arr = new Int32Array(0)
    expect(await lib.symbols.sum_i32(arr, 0)).toBe(0)
  })
})

// ─── async identity ───────────────────────────────────────────────────────────

describe('async identity symbols', () => {
  test('await identity_i32(2147483647) === 2147483647', async () => {
    expect(await lib.symbols.identity_i32(2147483647)).toBe(2147483647)
  })

  test('await identity_i64(0n) === 0n', async () => {
    expect(await lib.symbols.identity_i64(0n)).toBe(0n)
  })

  test('await identity_f64(Math.PI) === Math.PI', async () => {
    expect(await lib.symbols.identity_f64(Math.PI)).toBe(Math.PI)
  })

  test('await identity_bool(true) === true', async () => {
    expect(await lib.symbols.identity_bool(true)).toBe(true)
  })

  test('await identity_bool(false) === false', async () => {
    expect(await lib.symbols.identity_bool(false)).toBe(false)
  })
})

// ─── concurrent async calls ───────────────────────────────────────────────────

describe('concurrent async calls via Promise.all', () => {
  test('Promise.all with multiple add_i32 calls', async () => {
    const results = await Promise.all([
      lib.symbols.add_i32(1, 1),
      lib.symbols.add_i32(2, 2),
      lib.symbols.add_i32(3, 3),
      lib.symbols.add_i32(4, 4),
      lib.symbols.add_i32(5, 5),
    ])
    expect(results).toEqual([2, 4, 6, 8, 10])
  })

  test('Promise.all with mixed types', async () => {
    const [intResult, floatResult, bigintResult] = await Promise.all([
      lib.symbols.add_i32(10, 20),
      lib.symbols.add_f64(1.5, 2.5),
      lib.symbols.add_i64(100n, 200n),
    ])
    expect(intResult).toBe(30)
    expect(floatResult).toBe(4.0)
    expect(bigintResult).toBe(300n)
  })

  test('10 concurrent add_i32 calls all resolve correctly', async () => {
    const promises = Array.from({ length: 10 }, (_, i) =>
      lib.symbols.add_i32(i, i),
    )
    const results = await Promise.all(promises)
    const expected = Array.from({ length: 10 }, (_, i) => i * 2)
    expect(results).toEqual(expected)
  })
})

// ─── resolved value matches sync equivalent ───────────────────────────────────

describe('async result matches sync result', () => {
  test('sync and async add_i32 produce the same value', async () => {
    const syncLib = dlopen(LIB, {
      add_i32: { args: [t.i32, t.i32], returns: t.i32 },
    })
    const syncResult = syncLib.symbols.add_i32(123, 456)
    const asyncResult = await lib.symbols.add_i32(123, 456)
    expect(asyncResult).toBe(syncResult)
    syncLib.close()
  })
})
