import { dlopen as bunDlopen, FFIType, JSCallback, CString, ptr as bunPtr } from 'bun:ffi'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { resolveLibraryPathSync } from '../paths.js'
import { t as coreT } from '../types.js'
import { runtimeHint } from './hints.js'

export type { InferLibrary }

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
  throw new Error(`[unffi/bun] Unsupported FFI type "${kind}". ${runtimeHint(kind, 'bun')}`)
}

const bunExtensions = {
  i64_fast:   { kind: 'bun:i64_fast'   } as unknown as CType<number | bigint>,
  u64_fast:   { kind: 'bun:u64_fast'   } as unknown as CType<number | bigint>,
  napi_env:   { kind: 'bun:napi_env'   } as unknown as CType<unknown>,
  napi_value: { kind: 'bun:napi_value' } as unknown as CType<unknown>,
}

export const t: BunT = Object.assign({}, coreT, { bun: bunExtensions })

export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const resolvedPath = resolveLibraryPathSync(path)
  const bunSymbols: Record<string, { args: FFIType[]; returns: FFIType; nonblocking?: boolean }> = {}

  for (const [name, def] of Object.entries(schema)) {
    bunSymbols[name] = {
      args:    def.args.map((a: CType<unknown>) => getFFIType(a.kind)),
      returns: getFFIType(def.returns.kind),
      ...(def.async && { nonblocking: true }),
    }
  }

  const lib = bunDlopen(resolvedPath, bunSymbols)
  // NO FinalizationRegistry around JSCallbacks. C owns the function
  // pointer indefinitely — a library can stash a callback (logger, atexit,
  // signal handler) and invoke it long after the JS function is unreachable.
  // GC-driven free would race with a live C-side pointer → use-after-free.
  // Lifetime is bound to the library and freed in close().
  const callbacks = new Map<string, JSCallback>()

  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name, def] of Object.entries(schema)) {
    const rawFn = (lib.symbols as Record<string, (...a: unknown[]) => unknown>)[name]!

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
      const wrapped = [...args]

      for (const i of cstringInIdx) {
        const v = wrapped[i]
        if (typeof v === 'string') wrapped[i] = Buffer.from(v + '\0')
      }

      for (const i of bufferInIdx) {
        const v = wrapped[i]
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
              for (const j of cbCstrIdx) {
                const p = cbArgs[j]
                cbArgs[j] = p == null ? null : new CString(p as number & { __pointer__: null }).toString()
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

      if (returnsCstring) {
        if (result instanceof Promise) {
          return result.then((r) => (r instanceof String ? r.toString() : r))
        }
        if (result instanceof String) return result.toString()
      }
      return result
    }
  }

  let closed = false
  function close() {
    if (closed) return  // idempotent: safe to call after `using` already disposed
    closed = true
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
