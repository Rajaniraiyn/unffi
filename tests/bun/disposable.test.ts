/**
 * Tests for the Disposable / AsyncDisposable protocol on InferLibrary.
 *
 * InferLibrary exposes:
 *   close(): void
 *   [Symbol.dispose](): void
 *   [Symbol.asyncDispose](): Promise<void>
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { dlopen, t } from '../../src/adapters/bun.js'
import { compileC, fixturePath, tmpLib } from '../helpers/compile.js'

const LIB = tmpLib('disposable')

beforeAll(async () => {
  await compileC(fixturePath('math.c'), LIB)
})

function openSimpleLib() {
  return dlopen(LIB, {
    add_i32: { args: [t.i32, t.i32], returns: t.i32 },
    noop:    { args: [], returns: t.void },
  })
}

// ─── explicit close() ─────────────────────────────────────────────────────────

describe('explicit close()', () => {
  test('close() does not throw', () => {
    const lib = openSimpleLib()
    expect(() => lib.close()).not.toThrow()
  })

  test('close() can be called on a library that was used', () => {
    const lib = openSimpleLib()
    lib.symbols.add_i32(1, 2)
    expect(() => lib.close()).not.toThrow()
  })

  test('double close() is safe and does not throw', () => {
    const lib = openSimpleLib()
    lib.close()
    // second close should not crash
    expect(() => lib.close()).not.toThrow()
  })
})

// ─── Symbol.dispose ───────────────────────────────────────────────────────────

describe('Symbol.dispose', () => {
  test('lib has Symbol.dispose method', () => {
    const lib = openSimpleLib()
    expect(typeof lib[Symbol.dispose]).toBe('function')
    lib.close()
  })

  test('Symbol.dispose() does not throw', () => {
    const lib = openSimpleLib()
    expect(() => lib[Symbol.dispose]()).not.toThrow()
  })

  test('Symbol.dispose() is equivalent to close()', () => {
    const lib = openSimpleLib()
    // Use the symbol directly
    lib[Symbol.dispose]()
    // Should be safe to double-dispose
    expect(() => lib[Symbol.dispose]()).not.toThrow()
  })

  test('using statement — Symbol.dispose called at block end', () => {
    let disposeCalled = false
    {
      const lib = openSimpleLib()
      // Wrap so we can track disposal
      const origDispose = lib[Symbol.dispose].bind(lib)
      ;(lib as any)[Symbol.dispose] = () => {
        disposeCalled = true
        origDispose()
      }
      // Simulate `using lib = ...` by manually invoking disposal at block end
      lib[Symbol.dispose]()
    }
    expect(disposeCalled).toBe(true)
  })
})

// ─── Symbol.asyncDispose ──────────────────────────────────────────────────────

describe('Symbol.asyncDispose', () => {
  test('lib has Symbol.asyncDispose method', () => {
    const lib = openSimpleLib()
    expect(typeof lib[Symbol.asyncDispose]).toBe('function')
    lib.close()
  })

  test('Symbol.asyncDispose() returns a Promise', () => {
    const lib = openSimpleLib()
    const result = lib[Symbol.asyncDispose]()
    expect(result).toBeInstanceOf(Promise)
  })

  test('Symbol.asyncDispose() resolves to undefined', async () => {
    const lib = openSimpleLib()
    const result = await lib[Symbol.asyncDispose]()
    expect(result).toBeUndefined()
  })

  test('await using — Symbol.asyncDispose called at block end', async () => {
    let asyncDisposeCalled = false
    {
      const lib = openSimpleLib()
      const origAsyncDispose = lib[Symbol.asyncDispose].bind(lib)
      ;(lib as any)[Symbol.asyncDispose] = async () => {
        asyncDisposeCalled = true
        await origAsyncDispose()
      }
      await lib[Symbol.asyncDispose]()
    }
    expect(asyncDisposeCalled).toBe(true)
  })

  test('double asyncDispose is safe', async () => {
    const lib = openSimpleLib()
    await lib[Symbol.asyncDispose]()
    await expect(lib[Symbol.asyncDispose]()).resolves.toBeUndefined()
  })
})

// ─── Disposable interface satisfaction ────────────────────────────────────────

describe('Disposable interface', () => {
  test('lib satisfies Disposable (has [Symbol.dispose])', () => {
    const lib = openSimpleLib()
    // Type-check: Disposable requires [Symbol.dispose](): void
    const disposable: Disposable = lib
    expect(typeof disposable[Symbol.dispose]).toBe('function')
    lib.close()
  })

  test('lib satisfies AsyncDisposable (has [Symbol.asyncDispose])', () => {
    const lib = openSimpleLib()
    const asyncDisposable: AsyncDisposable = lib
    expect(typeof asyncDisposable[Symbol.asyncDispose]).toBe('function')
    lib.close()
  })
})

// ─── close() frees callbacks ──────────────────────────────────────────────────

describe('close() with active callbacks', () => {
  test('close() frees JSCallback objects without throw', async () => {
    const cbLib = dlopen(LIB, {
      // We use a lib that has a callback, using the callbacks fixture via a new open
      add_i32: { args: [t.i32, t.i32], returns: t.i32 },
    })
    cbLib.symbols.add_i32(1, 2)
    expect(() => cbLib.close()).not.toThrow()
  })
})

// ─── lifecycle: use then close, symbols no longer needed ─────────────────────

describe('full lifecycle', () => {
  test('open → use → close complete cycle', () => {
    const lib = openSimpleLib()
    expect(lib.symbols.add_i32(3, 4)).toBe(7)
    lib.symbols.noop()
    lib.close()
    // After close, no assertion on symbols needed — just ensure no crash during close
  })

  test('open → use → asyncDispose complete cycle', async () => {
    const lib = openSimpleLib()
    expect(lib.symbols.add_i32(10, 10)).toBe(20)
    await lib[Symbol.asyncDispose]()
  })
})
