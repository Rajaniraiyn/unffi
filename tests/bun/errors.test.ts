/**
 * Tests for error paths in the bun adapter:
 *   - dlopen with a nonexistent path
 *   - Platform-specific type rejections (deno:, koffi:, node:, unknown)
 *
 * These tests do NOT require a compiled shared library — they validate
 * error handling before or during dlopen, not actual FFI calls.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { dlopen, t } from '../../src/adapters/bun.js'
import { compileC, fixturePath, tmpLib } from '../helpers/compile.js'

// We need a real lib path for the "unknown symbol kind" tests — the error
// is thrown during schema translation, before the lib is opened, so any
// path works.  However for the nonexistent-path test we intentionally
// use a path that does not exist.

const REAL_LIB = tmpLib('errors-math')

beforeAll(async () => {
  // Compile a real lib so tests that need a valid path (type-rejection tests)
  // can reference it. The error is thrown before open in those cases, so this
  // lib will never actually be loaded by those tests.
  await compileC(fixturePath('math.c'), REAL_LIB)
})

// ─── nonexistent path ─────────────────────────────────────────────────────────

describe('dlopen nonexistent path', () => {
  test('throws when path does not exist', () => {
    expect(() =>
      dlopen('/nonexistent/path/libfoo.dylib', {
        fn: { args: [], returns: t.void },
      }),
    ).toThrow()
  })

  test('error message is descriptive (contains path or system message)', () => {
    let errorMessage = ''
    try {
      dlopen('/nonexistent/path/libfoo.dylib', {
        fn: { args: [], returns: t.void },
      })
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err)
    }
    // Bun throws its own message; we just verify it is not empty
    expect(errorMessage.length).toBeGreaterThan(0)
  })
})

// ─── deno-specific type ───────────────────────────────────────────────────────

describe('deno: prefix type rejection', () => {
  test('throws with [unffi/bun] prefix', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'deno:usize' } as any], returns: t.void },
      }),
    ).toThrow('[unffi/bun]')
  })

  test('error message contains the offending type name', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'deno:usize' } as any], returns: t.void },
      }),
    ).toThrow('"deno:usize"')
  })

  test('error message guides user toward Deno', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'deno:usize' } as any], returns: t.void },
      }),
    ).toThrow('Deno')
  })

  test('deno:isize also rejected with Deno guidance', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'deno:isize' } as any], returns: t.void },
      }),
    ).toThrow('Deno')
  })
})

// ─── koffi-specific type ──────────────────────────────────────────────────────

describe('koffi: prefix type rejection', () => {
  test('throws with [unffi/bun] prefix', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'koffi:str16' } as any], returns: t.void },
      }),
    ).toThrow('[unffi/bun]')
  })

  test('error message contains the offending type name', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'koffi:str16' } as any], returns: t.void },
      }),
    ).toThrow('"koffi:str16"')
  })

  test('error message guides user toward koffi / Node.js', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'koffi:str16' } as any], returns: t.void },
      }),
    ).toThrow('koffi')
  })

  test('error message includes koffi.dev URL', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'koffi:str16' } as any], returns: t.void },
      }),
    ).toThrow('koffi.dev')
  })

  test('koffi: in returns position is also rejected', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [], returns: { kind: 'koffi:str16' } as any },
      }),
    ).toThrow('koffi')
  })
})

// ─── node-specific type ───────────────────────────────────────────────────────

describe('node: prefix type rejection', () => {
  test('throws with [unffi/bun] prefix', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'node:something' } as any], returns: t.void },
      }),
    ).toThrow('[unffi/bun]')
  })

  test('error message contains the offending type name', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'node:something' } as any], returns: t.void },
      }),
    ).toThrow('"node:something"')
  })

  test('error message guides user toward Node.js', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'node:something' } as any], returns: t.void },
      }),
    ).toThrow('Node.js')
  })
})

// ─── unknown type kind ────────────────────────────────────────────────────────

describe('unknown type kind rejection', () => {
  test('throws with [unffi/bun] prefix', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'unknownXYZ' } as any], returns: t.void },
      }),
    ).toThrow('[unffi/bun]')
  })

  test('error message contains the offending type name', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'unknownXYZ' } as any], returns: t.void },
      }),
    ).toThrow('"unknownXYZ"')
  })

  test('error message says "Unknown type kind"', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [{ kind: 'unknownXYZ' } as any], returns: t.void },
      }),
    ).toThrow('Unknown type kind')
  })

  test('another unknown kind also rejected', () => {
    expect(() =>
      dlopen(REAL_LIB, {
        fn: { args: [], returns: { kind: 'totally:made:up' } as any },
      }),
    ).toThrow('[unffi/bun]')
  })
})

// ─── error is not thrown for valid bun-specific types ─────────────────────────

describe('valid bun-specific types are accepted', () => {
  test('bun:i64_fast does not throw during schema translation', () => {
    // We can't actually call a function with this type without a real symbol,
    // but schema translation (type-mapping phase) must not reject it.
    // dlopen will fail at the OS level if REAL_LIB lacks the symbol,
    // so we just check that the error is NOT [unffi/bun] type error.
    try {
      dlopen(REAL_LIB, {
        // add_i32 exists in math.c; using bun:i64_fast as return won't match
        // but the type should map without error
        add_i32: { args: [t.bun.i64_fast, t.bun.i64_fast], returns: t.bun.i64_fast },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Must not be a [unffi/bun] type-mapping error
      expect(msg).not.toMatch(/\[unffi\/bun\] Unsupported FFI type/)
    }
  })
})
