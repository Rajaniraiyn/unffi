import { dlopen as bunDlopen, FFIType, JSCallback, CString, ptr as bunPtr } from 'bun:ffi'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

// ─── BunT — extends CoreT with Bun-specific FFI types ─────────────────────────
//
// These are EXTRA types only available via the "bun" export condition. They map
// directly to Bun's bun:ffi FFIType enum and surface features (fast paths,
// NAPI interop) that other runtimes don't have. The user-visible JS type is
// taken straight from Bun's own FFITypeToReturnsType so we never re-declare it.
export interface BunT extends CoreT {
  readonly bun: {
    /**
     * 64-bit signed integer that returns `number` when the value fits in a
     * safe integer, `bigint` otherwise. Same as `FFIType.i64_fast`.
     */
    readonly i64_fast:   CType<number | bigint>
    /**
     * 64-bit unsigned integer that returns `number` when the value fits in a
     * safe integer, `bigint` otherwise. Same as `FFIType.u64_fast`.
     */
    readonly u64_fast:   CType<number | bigint>
    /** NAPI environment pointer — for interop with Node-API addons. */
    readonly napi_env:   CType<unknown>
    /** NAPI value — for interop with Node-API addons. */
    readonly napi_value: CType<unknown>
  }
}

// ─── Core type map (exhaustive over CTypeKind) ────────────────────────────────
const coreFFITypes: Record<CTypeKind, FFIType> = {
  void:     FFIType.void,
  bool:     FFIType.bool,
  i8:       FFIType.int8_t,
  i16:      FFIType.int16_t,
  i32:      FFIType.int32_t,
  i64:      FFIType.int64_t,
  u8:       FFIType.uint8_t,
  u16:      FFIType.uint16_t,
  u32:      FFIType.uint32_t,
  u64:      FFIType.uint64_t,
  f32:      FFIType.float,
  f64:      FFIType.double,
  cstring:  FFIType.cstring,
  pointer:  FFIType.ptr,
  buffer:   FFIType.ptr,
  function: FFIType.function,
}

// ─── Bun-specific types ───────────────────────────────────────────────────────
const bunFFITypes: Record<string, FFIType> = {
  'bun:i64_fast':   FFIType.i64_fast,
  'bun:u64_fast':   FFIType.u64_fast,
  'bun:napi_env':   FFIType.napi_env,
  'bun:napi_value': FFIType.napi_value,
}

const allFFITypes: Record<string, FFIType> = { ...coreFFITypes, ...bunFFITypes }

function getFFIType(kind: string): FFIType {
  const type = allFFITypes[kind]
  if (type !== undefined) return type
  const hint =
    kind.startsWith('deno:')  ? 'This is a Deno-specific type — run with Deno. See https://docs.deno.com/runtime/fundamentals/ffi/' :
    kind.startsWith('node:')  ? 'This is a Node.js-specific type — run with Node.js.' :
    kind.startsWith('koffi:') ? 'This is a koffi-specific type — run with Node.js and install koffi. See https://koffi.dev' :
    'Unknown type kind.'
  throw new Error(`[unffi/bun] Unsupported FFI type "${kind}". ${hint}`)
}

// ─── Bun-specific t extensions ────────────────────────────────────────────────
const bunExtensions = {
  i64_fast:   { kind: 'bun:i64_fast'   } as unknown as CType<number | bigint>,
  u64_fast:   { kind: 'bun:u64_fast'   } as unknown as CType<number | bigint>,
  napi_env:   { kind: 'bun:napi_env'   } as unknown as CType<unknown>,
  napi_value: { kind: 'bun:napi_value' } as unknown as CType<unknown>,
}

export const t: BunT = Object.assign({}, coreT, { bun: bunExtensions })

// ─── dlopen ───────────────────────────────────────────────────────────────────

// Bun's Pointer brand
type BunPtr = number & { __pointer__: null }

/**
 * Open a shared library. Symbols are typed from the schema.
 *
 * Under Bun this uses `bun:ffi` directly. Normalisations applied so the
 * surface is identical to other runtimes:
 *
 *   - cstring INPUT  : plain `string`  → null-terminated `Buffer`
 *     (Bun's FFI rejects raw JS strings; we encode here so users pass strings).
 *   - cstring OUTPUT : `CString`       → plain `string` primitive
 *   - cstring in callback args (C → JS): raw pointer `number` → decoded `string`
 *     (Bun delivers a Pointer to JSCallback; we wrap with `new CString(p).toString()`).
 *   - buffer args    : `TypedArray`    → zero-copy pointer via `ptr(view)`
 *     (Bun accepts a TypedArray directly for FFIType.ptr, but `ptr()` skips
 *     a small per-call coercion in the JIT wrapper.)
 *   - JSCallbacks are tracked and closed alongside the library.
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const bunSymbols: Record<string, { args: FFIType[]; returns: FFIType; nonblocking?: boolean }> = {}

  for (const [name, def] of Object.entries(schema)) {
    bunSymbols[name] = {
      args:    def.args.map((a: CType<unknown>) => getFFIType(a.kind)),
      returns: getFFIType(def.returns.kind),
      ...(def.async && { nonblocking: true }),
    }
  }

  const lib = bunDlopen(path, bunSymbols)
  const callbacks = new Map<string, JSCallback>()

  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name, def] of Object.entries(schema)) {
    const rawFn = (lib.symbols as Record<string, (...a: unknown[]) => unknown>)[name]!

    // Pre-compute argument transform indices so the hot path is branch-light.
    const cstringInIdx = def.args
      .map((a: CType<unknown>, i: number) => (a.kind === 'cstring'  ? i : -1))
      .filter((i: number) => i !== -1)
    const bufferInIdx = def.args
      .map((a: CType<unknown>, i: number) => (a.kind === 'buffer'   ? i : -1))
      .filter((i: number) => i !== -1)
    const callbackIdx = def.args
      .map((a: CType<unknown>, i: number) => (a.kind === 'function' ? i : -1))
      .filter((i: number) => i !== -1)
    const returnsCstring = def.returns.kind === 'cstring'

    // Fast path: no normalisation needed — return Bun's raw function directly.
    if (
      cstringInIdx.length === 0 &&
      bufferInIdx.length  === 0 &&
      callbackIdx.length  === 0 &&
      !returnsCstring
    ) {
      symbols[name] = rawFn
      continue
    }

    symbols[name] = (...args: unknown[]) => {
      // Copy once; mutate the copy in-place.
      const wrapped = args.length === def.args.length ? args.slice() : [...args]

      for (const i of cstringInIdx) {
        const v = wrapped[i]
        if (typeof v === 'string') wrapped[i] = Buffer.from(v + '\0')
      }

      for (const i of bufferInIdx) {
        const v = wrapped[i]
        // ArrayBufferView covers TypedArrays + DataView. Skip if user already
        // passed a Pointer (number). For empty views Bun's `ptr()` throws —
        // fall through and let Bun's FFI accept the TypedArray directly
        // (it treats a zero-length view as a null pointer).
        if (v != null && typeof v === 'object' && ArrayBuffer.isView(v) && v.byteLength > 0) {
          wrapped[i] = bunPtr(v as NodeJS.TypedArray)
        }
      }

      for (const i of callbackIdx) {
        const cb     = def.args[i] as CCallback<readonly CType<unknown>[], CType<unknown>>
        const userFn = wrapped[i] as (...a: unknown[]) => unknown
        const cbCstrIdx = cb.argTypes
          .map((a: CType<unknown>, j: number) => (a.kind === 'cstring' ? j : -1))
          .filter((j: number) => j !== -1)

        const wrappedFn = cbCstrIdx.length === 0
          ? userFn
          : (...cbArgs: unknown[]) => {
              // Bun delivers a raw Pointer (number) for cstring callback args.
              // Decode to a plain JS string so user callbacks are runtime-agnostic.
              for (const j of cbCstrIdx) {
                const p = cbArgs[j]
                cbArgs[j] = p == null ? null : new CString(p as BunPtr).toString()
              }
              return userFn(...cbArgs)
            }

        const jsCb = new JSCallback(wrappedFn, {
          args:    cb.argTypes.map((a: CType<unknown>) => getFFIType(a.kind)),
          returns: getFFIType(cb.returnType.kind),
        })
        callbacks.set(`${name}:${i}`, jsCb)
        wrapped[i] = jsCb.ptr
      }

      const result = rawFn(...wrapped)

      // CString extends String — coerce to a plain string primitive. For async
      // (nonblocking) symbols the result is a Promise; thread the decode through.
      if (returnsCstring) {
        if (result instanceof Promise) {
          return result.then((r) => (r instanceof String ? r.toString() : r))
        }
        if (result instanceof String) return result.toString()
      }
      return result
    }
  }

  function close() {
    for (const cb of callbacks.values()) cb.close()
    callbacks.clear()
    lib.close()
  }

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}
