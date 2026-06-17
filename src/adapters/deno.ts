import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind } from '../types.js'
import { t } from '../types.js'

export type { InferLibrary }
export { t }

// ponytail: Deno uses string type names; cstring → pointer (read via UnsafePointerView)
type DenoNativeType =
  | 'void' | 'bool'
  | 'u8' | 'i8' | 'u16' | 'i16' | 'u32' | 'i32' | 'u64' | 'i64'
  | 'f32' | 'f64'
  | 'pointer' | 'buffer' | 'function'

const toDenoType: Record<CTypeKind, DenoNativeType> = {
  void:     'void',
  bool:     'bool',
  i8:       'i8',  i16: 'i16', i32: 'i32', i64: 'i64',
  u8:       'u8',  u16: 'u16', u32: 'u32', u64: 'u64',
  f32:      'f32', f64: 'f64',
  cstring:  'pointer',
  pointer:  'pointer',
  buffer:   'buffer',
  function: 'function',
}

/**
 * Open a shared library. Symbols are typed from the schema.
 * Under Deno this uses `Deno.dlopen` — native perf, requires `--allow-ffi`.
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const denoSymbols: Record<string, Deno.ForeignFunction> = {}

  // Deno supports synchronous FFI — no restriction on sync symbols
  const SUPPORTS_SYNC = true as const

  for (const [name, def] of Object.entries(schema)) {
    if (!SUPPORTS_SYNC && !def.async) throw new Error(
      `[unffi/deno] Synchronous FFI is not supported in this runtime. Add \`async: true\` to "${name}".`,
    )
    denoSymbols[name] = {
      parameters: def.args.map((a: CType<unknown>) => toDenoType[a.kind] as Deno.NativeType),
      result:     toDenoType[def.returns.kind] as Deno.NativeResultType,
      ...(def.async && { nonblocking: true }),
    }
  }

  let lib: ReturnType<typeof Deno.dlopen>
  try {
    lib = Deno.dlopen(path, denoSymbols)
  } catch (e) {
    if (e instanceof Deno.errors.PermissionDenied) {
      throw new Error(
        '[unffi] Deno FFI requires the --allow-ffi permission flag.\n' +
        '  Run your script with: deno run --allow-ffi <script.ts>\n' +
        '  Docs: https://docs.deno.com/runtime/fundamentals/ffi/',
      )
    }
    throw e
  }
  const callbacks = new Map<string, Deno.UnsafeCallback>()

  const symbols = new Proxy(
    lib.symbols as Record<string, (...args: unknown[]) => unknown>,
    {
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
            const unsafeCb = new Deno.UnsafeCallback(
              {
                parameters: cb.argTypes.map((a: CType<unknown>) => toDenoType[a.kind] as Deno.NativeType),
                result:     toDenoType[cb.returnType.kind] as Deno.NativeResultType,
              },
              args[i] as (...a: unknown[]) => unknown,
            )
            callbacks.set(`${name}:${i}`, unsafeCb)
            wrapped[i] = unsafeCb.pointer
          }
          return fn(...wrapped)
        }
      },
    },
  )

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close() {
      for (const cb of callbacks.values()) cb.close()
      callbacks.clear()
      lib.close()
    },
  }
}
