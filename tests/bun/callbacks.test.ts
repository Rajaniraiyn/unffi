/**
 * Tests for the bun adapter's callback (JSCallback) support.
 *
 * The existing callbacks.c has the following signatures (fn ptr is FIRST arg):
 *   int32_t apply_i32(int32_t (*fn)(int32_t), int32_t x)
 *   int32_t apply_twice(int32_t (*fn)(int32_t), int32_t x)
 *   void    transform_array(int32_t *arr, int32_t len, int32_t (*fn)(int32_t))
 *   int32_t reduce_i32(int32_t *arr, int32_t len, int32_t init, int32_t (*fn)(int32_t, int32_t))
 *   void    call_with_message(void (*fn)(const char *), const char *msg)
 *   void    sort_ints(int32_t *arr, int32_t len, int32_t (*cmp)(int32_t, int32_t))
 *   int32_t count_matching(int32_t *arr, int32_t len, bool (*pred)(int32_t), int32_t *out)
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { CString } from 'bun:ffi'
import { dlopen, t } from '../../src/adapters/bun.js'
import { compileC, fixturePath, tmpLib } from '../helpers/compile.js'

const LIB = tmpLib('callbacks')

let lib: ReturnType<typeof openLib>

function openLib() {
  return dlopen(LIB, {
    // fn ptr is FIRST arg in callbacks.c
    apply_i32:   { args: [t.fn([t.i32], t.i32), t.i32], returns: t.i32 },
    apply_twice: { args: [t.fn([t.i32], t.i32), t.i32], returns: t.i32 },

    // transform_array: fn ptr is THIRD arg
    transform_array: { args: [t.buffer, t.i32, t.fn([t.i32], t.i32)], returns: t.void },

    // reduce_i32: fn ptr is FOURTH arg
    reduce_i32: { args: [t.buffer, t.i32, t.i32, t.fn([t.i32, t.i32], t.i32)], returns: t.i32 },

    // call_with_message: fn ptr is FIRST arg, string is SECOND
    call_with_message: { args: [t.fn([t.cstring], t.void), t.cstring], returns: t.void },

    // sort_ints: fn ptr is THIRD arg
    sort_ints: { args: [t.buffer, t.i32, t.fn([t.i32, t.i32], t.i32)], returns: t.void },

    // count_matching: bool pred is THIRD arg, output ptr is FOURTH
    count_matching: { args: [t.buffer, t.i32, t.fn([t.i32], t.bool), t.pointer], returns: t.i32 },
  })
}

beforeAll(async () => {
  await compileC(fixturePath('callbacks.c'), LIB)
  lib = openLib()
})

afterAll(() => {
  lib.close()
})

// ─── apply_i32 ────────────────────────────────────────────────────────────────

describe('apply_i32 — basic callback invocation', () => {
  test('apply_i32(x => x * 2, 5) === 10', () => {
    expect(lib.symbols.apply_i32((x: number) => x * 2, 5)).toBe(10)
  })

  test('apply_i32(x => x + 1, 0) === 1', () => {
    expect(lib.symbols.apply_i32((x: number) => x + 1, 0)).toBe(1)
  })

  test('apply_i32(x => -x, -3) === 3', () => {
    expect(lib.symbols.apply_i32((x: number) => -x, -3)).toBe(3)
  })

  test('apply_i32(x => x, 42) === 42 — identity callback', () => {
    expect(lib.symbols.apply_i32((x: number) => x, 42)).toBe(42)
  })

  test('apply_i32(x => 0, 999) === 0 — constant callback', () => {
    expect(lib.symbols.apply_i32((_x: number) => 0, 999)).toBe(0)
  })
})

// ─── apply_twice ──────────────────────────────────────────────────────────────

describe('apply_twice — callback applied twice', () => {
  test('apply_twice(x => x * 2, 3) === 12 — doubles twice', () => {
    expect(lib.symbols.apply_twice((x: number) => x * 2, 3)).toBe(12)
  })

  test('apply_twice(x => x + 10, 5) === 25 — adds 10 twice', () => {
    expect(lib.symbols.apply_twice((x: number) => x + 10, 5)).toBe(25)
  })
})

// ─── callback captures closure state ─────────────────────────────────────────

describe('callback — closure state capture', () => {
  test('callback closes over external variable', () => {
    let total = 0
    lib.symbols.apply_i32((x: number) => { total += x; return x }, 5)
    expect(total).toBe(5)
  })

  test('closure state persists across multiple C calls', () => {
    let total = 0
    lib.symbols.apply_i32((x: number) => { total += x; return x }, 5)
    lib.symbols.apply_i32((x: number) => { total += x; return x }, 5)
    expect(total).toBe(10)
  })

  test('different closures are independent', () => {
    let a = 0
    let b = 0
    lib.symbols.apply_i32((x: number) => { a += x; return x }, 3)
    lib.symbols.apply_i32((x: number) => { b += x; return x }, 7)
    expect(a).toBe(3)
    expect(b).toBe(7)
  })
})

// ─── reduce_i32 ───────────────────────────────────────────────────────────────

describe('reduce_i32 — multi-arg callback (fold)', () => {
  test('sum [1,2,3,4] starting at 0 === 10', () => {
    const arr = new Int32Array([1, 2, 3, 4])
    expect(lib.symbols.reduce_i32(arr, arr.length, 0, (acc: number, x: number) => acc + x)).toBe(10)
  })

  test('product [2,3] starting at 1 === 6', () => {
    const arr = new Int32Array([2, 3])
    expect(lib.symbols.reduce_i32(arr, arr.length, 1, (acc: number, x: number) => acc * x)).toBe(6)
  })

  test('max of [3,1,4,1,5,9] === 9', () => {
    const arr = new Int32Array([3, 1, 4, 1, 5, 9])
    expect(
      lib.symbols.reduce_i32(arr, arr.length, -2147483648, (acc: number, x: number) => x > acc ? x : acc)
    ).toBe(9)
  })

  test('min of [3,1,4,1,5] starting at INT32_MAX === 1', () => {
    const arr = new Int32Array([3, 1, 4, 1, 5])
    expect(
      lib.symbols.reduce_i32(arr, arr.length, 2147483647, (acc: number, x: number) => x < acc ? x : acc)
    ).toBe(1)
  })

  test('empty array returns init value', () => {
    const arr = new Int32Array(0)
    expect(lib.symbols.reduce_i32(arr, 0, 42, (acc: number, x: number) => acc + x)).toBe(42)
  })
})

// ─── sort_ints ────────────────────────────────────────────────────────────────

describe('sort_ints — comparator callback', () => {
  test('ascending sort', () => {
    const arr = new Int32Array([5, 3, 1, 4, 2])
    lib.symbols.sort_ints(arr, arr.length, (a: number, b: number) => a - b)
    expect(Array.from(arr)).toEqual([1, 2, 3, 4, 5])
  })

  test('descending sort', () => {
    const arr = new Int32Array([5, 3, 1, 4, 2])
    lib.symbols.sort_ints(arr, arr.length, (a: number, b: number) => b - a)
    expect(Array.from(arr)).toEqual([5, 4, 3, 2, 1])
  })

  test('already sorted array stays sorted', () => {
    const arr = new Int32Array([1, 2, 3, 4, 5])
    lib.symbols.sort_ints(arr, arr.length, (a: number, b: number) => a - b)
    expect(Array.from(arr)).toEqual([1, 2, 3, 4, 5])
  })

  test('single element array stays unchanged', () => {
    const arr = new Int32Array([42])
    lib.symbols.sort_ints(arr, arr.length, (a: number, b: number) => a - b)
    expect(Array.from(arr)).toEqual([42])
  })
})

// ─── call_with_message ────────────────────────────────────────────────────────

describe('call_with_message — string callback', () => {
  test('callback receives the string argument', () => {
    let received: string | null = null
    // cstring INPUT to Bun FFI must be a null-terminated Buffer
    // Bun passes cstring callback args as raw pointer numbers — decode with CString.
    // cstring INPUT to C must be a null-terminated Buffer.
    lib.symbols.call_with_message(
      (ptr: string) => { received = new CString(ptr as unknown as number).toString() },
      Buffer.from('hello unffi\0'),
    )
    expect(received).toBe('hello unffi')
  })

  test('callback accumulates values across calls', () => {
    const collected: string[] = []
    lib.symbols.call_with_message(
      (ptr: string) => collected.push(new CString(ptr as unknown as number).toString()),
      Buffer.from('first\0'),
    )
    lib.symbols.call_with_message(
      (ptr: string) => collected.push(new CString(ptr as unknown as number).toString()),
      Buffer.from('second\0'),
    )
    expect(collected).toEqual(['first', 'second'])
  })
})

// ─── count_matching ───────────────────────────────────────────────────────────

describe('count_matching — predicate callback', () => {
  test('count even numbers in [1,2,3,4,5,6] === 3', () => {
    const arr = new Int32Array([1, 2, 3, 4, 5, 6])
    const result = lib.symbols.count_matching(arr, arr.length, (x: number) => x % 2 === 0, null)
    expect(result).toBe(3)
  })

  test('count positive numbers in [-1,-2,3,4,-5] === 2', () => {
    const arr = new Int32Array([-1, -2, 3, 4, -5])
    const result = lib.symbols.count_matching(arr, arr.length, (x: number) => x > 0, null)
    expect(result).toBe(2)
  })

  test('count_matching all false predicate returns 0', () => {
    const arr = new Int32Array([1, 2, 3])
    const result = lib.symbols.count_matching(arr, arr.length, (_x: number) => false, null)
    expect(result).toBe(0)
  })

  test('count_matching all true predicate returns len', () => {
    const arr = new Int32Array([1, 2, 3, 4])
    const result = lib.symbols.count_matching(arr, arr.length, (_x: number) => true, null)
    expect(result).toBe(4)
  })
})

// ─── transform_array ──────────────────────────────────────────────────────────

describe('transform_array — in-place mutation with callback', () => {
  test('double every element', () => {
    const arr = new Int32Array([1, 2, 3, 4, 5])
    lib.symbols.transform_array(arr, arr.length, (x: number) => x * 2)
    expect(Array.from(arr)).toEqual([2, 4, 6, 8, 10])
  })

  test('negate every element', () => {
    const arr = new Int32Array([1, -2, 3, -4])
    lib.symbols.transform_array(arr, arr.length, (x: number) => -x)
    expect(Array.from(arr)).toEqual([-1, 2, -3, 4])
  })

  test('zero out every element', () => {
    const arr = new Int32Array([7, 8, 9])
    lib.symbols.transform_array(arr, arr.length, (_x: number) => 0)
    expect(Array.from(arr)).toEqual([0, 0, 0])
  })

  test('callback invocation count equals array length', () => {
    let calls = 0
    const arr = new Int32Array([1, 2, 3, 4])
    lib.symbols.transform_array(arr, arr.length, (x: number) => { calls++; return x })
    expect(calls).toBe(4)
  })
})

// ─── callback memory / lifecycle ─────────────────────────────────────────────

describe('callback memory lifecycle', () => {
  test('close() does not throw even when callbacks were used', () => {
    const tempLib = dlopen(LIB, {
      apply_i32: { args: [t.fn([t.i32], t.i32), t.i32], returns: t.i32 },
    })
    tempLib.symbols.apply_i32((x: number) => x + 1, 10)
    expect(() => tempLib.close()).not.toThrow()
  })

  test('lib with multiple callbacks can be closed without leaking', () => {
    const tempLib = dlopen(LIB, {
      apply_i32: { args: [t.fn([t.i32], t.i32), t.i32], returns: t.i32 },
    })
    // Multiple calls, each creates a JSCallback
    tempLib.symbols.apply_i32((x: number) => x * 2, 1)
    tempLib.symbols.apply_i32((x: number) => x + 1, 2)
    expect(() => tempLib.close()).not.toThrow()
  })
})
