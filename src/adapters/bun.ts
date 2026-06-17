import { dlopen as bunDlopen, FFIType, JSCallback } from 'bun:ffi'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

// ─── BunT — extends CoreT with Bun-specific FFI types ─────────────────────────
export interface BunT extends CoreT {
  readonly bun: {
    /** i64 that returns `number` when the value fits safely, `BigInt` otherwise */
    readonly i64_fast:   CType<number | bigint>
    /** u64 that returns `number` when the value fits safely, `BigInt` otherwise */
    readonly u64_fast:   CType<number | bigint>
    /** NAPI environment pointer (for NAPI-based native addons) */
    readonly napi_env:   CType<unknown>
    /** NAPI value (for NAPI-based native addons) */
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
  'bun:i64_fast':  FFIType.i64_fast,
  'bun:u64_fast':  FFIType.u64_fast,
  'bun:napi_env':  FFIType.napi_env,
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
// These are only available when resolved via the "bun" export condition.
const bunExtensions = {
  /** i64 that returns `number` when the value fits safely, `BigInt` otherwise */
  i64_fast:   { kind: 'bun:i64_fast'  } as unknown as CType<number | bigint>,
  /** u64 that returns `number` when the value fits safely, `BigInt` otherwise */
  u64_fast:   { kind: 'bun:u64_fast'  } as unknown as CType<number | bigint>,
  /** NAPI environment pointer (for NAPI-based native addons) */
  napi_env:   { kind: 'bun:napi_env'  } as unknown as CType<unknown>,
  /** NAPI value (for NAPI-based native addons) */
  napi_value: { kind: 'bun:napi_value' } as unknown as CType<unknown>,
}

export const t: BunT = Object.assign({}, coreT, { bun: bunExtensions });

// ─── dlopen ───────────────────────────────────────────────────────────────────

/**
 * Open a shared library. Symbols are typed from the schema.
 * Under Bun this uses `bun:ffi` — zero overhead, native perf.
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const SUPPORTS_SYNC = true as const

  const bunSymbols: Record<string, { args: FFIType[]; returns: FFIType; nonblocking?: boolean }> = {}

  for (const [name, def] of Object.entries(schema)) {
    if (!SUPPORTS_SYNC && !def.async) throw new Error(
      `[unffi/bun] Synchronous FFI is not supported in this runtime. Add \`async: true\` to "${name}".`,
    )
    bunSymbols[name] = {
      args:    def.args.map((a: CType<unknown>) => getFFIType(a.kind)),
      returns: getFFIType(def.returns.kind),
      ...(def.async && { nonblocking: true }),
    }
  }

  const lib = bunDlopen(path, bunSymbols)
  const callbacks = new Map<string, JSCallback>()

  const symbols = new Proxy(lib.symbols as Record<string, (...args: unknown[]) => unknown>, {
    get(target, name: string) {
      const fn = target[name]
      const def = schema[name]
      if (!fn || !def) return undefined

      const callbackIndexes = def.args
        .map((a: CType<unknown>, i: number) => (a.kind === 'function' ? i : -1))
        .filter((i: number) => i !== -1)

      if (callbackIndexes.length === 0) return fn

      return (...args: unknown[]) => {
        const wrapped = [...args]
        for (const i of callbackIndexes) {
          const cb = def.args[i] as CCallback<readonly CType<unknown>[], CType<unknown>>
          const jsCb = new JSCallback(args[i] as (...a: unknown[]) => unknown, {
            args:    cb.argTypes.map((a: CType<unknown>) => getFFIType(a.kind)),
            returns: getFFIType(cb.returnType.kind),
          })
          callbacks.set(`${name}:${i}`, jsCb)
          wrapped[i] = jsCb.ptr
        }
        return fn(...wrapped)
      }
    },
  })

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
