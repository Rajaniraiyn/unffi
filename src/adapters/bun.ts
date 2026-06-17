import { dlopen as bunDlopen, FFIType, JSCallback } from 'bun:ffi'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind } from '../types.js'
import { t } from '../types.js'

export type { InferLibrary }
export { t }

// ponytail: Bun uses FFIType enum; callbacks are passed as JSCallback.ptr (pointer)
const toFFIType: Record<CTypeKind, FFIType> = {
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

/**
 * Open a shared library. Symbols are typed from the schema.
 * Under Bun this uses `bun:ffi` — zero overhead, native perf.
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  // Bun supports synchronous FFI — no restriction on sync symbols
  const SUPPORTS_SYNC = true as const

  const bunSymbols: Record<string, { args: FFIType[]; returns: FFIType; nonblocking?: boolean }> = {}

  for (const [name, def] of Object.entries(schema)) {
    if (!SUPPORTS_SYNC && !def.async) throw new Error(
      `[unffi/bun] Synchronous FFI is not supported in this runtime. Add \`async: true\` to "${name}".`,
    )
    bunSymbols[name] = {
      args:    def.args.map((a: CType<unknown>) => toFFIType[a.kind]),
      returns: toFFIType[def.returns.kind],
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
            args:    cb.argTypes.map((a: CType<unknown>) => toFFIType[a.kind]),
            returns: toFFIType[cb.returnType.kind],
          })
          callbacks.set(`${name}:${i}`, jsCb)
          wrapped[i] = jsCb.ptr
        }
        return fn(...wrapped)
      }
    },
  })

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close() {
      for (const cb of callbacks.values()) cb.close()
      callbacks.clear()
      lib.close()
    },
  }
}
