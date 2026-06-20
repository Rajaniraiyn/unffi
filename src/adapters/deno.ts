import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { libraryExtensions, resolveLibraryPath } from '../paths.js'
import { t as coreT } from '../types.js'
import { runtimeHint } from './hints.js'

export type { InferLibrary }

export interface DenoT extends CoreT {
  readonly deno: {
    /** Pointer-sized unsigned integer (64-bit on 64-bit systems) → `bigint` */
    readonly usize: CType<bigint>
    /** Pointer-sized signed integer (64-bit on 64-bit systems) → `bigint` */
    readonly isize: CType<bigint>
    /**
     * Compose a struct C type. Passed by value to/from FFI as a
     * BufferSource → Uint8Array. The `fields` argument is a list of
     * unffi CType<*> tokens; their `kind`s are translated to Deno's
     * NativeType under the hood.
     *
     * Example:
     *   const Point = t.deno.struct([t.f32, t.f32])
     */
    struct<const Fields extends readonly CType<any>[]>(fields: Fields): CType<Uint8Array>

    /**
     * Zero-copy: return a Deno pointer to a TypedArray's memory.
     * Pass the result to symbols typed as `t.pointer`.
     * Equivalent to `Deno.UnsafePointer.of(view)`.
     */
    ptrOf(view: ArrayBufferView | ArrayBuffer): Deno.PointerValue

    /**
     * Read a UTF-8 NUL-terminated string from a pointer.
     * Useful for symbols that return `t.pointer` instead of `t.cstring`
     * (e.g. when you need offset arithmetic).
     */
    readCString(pointer: Deno.PointerValue, offset?: number): string

    /**
     * Zero-copy read of `byteLength` bytes at `pointer + offset` as an ArrayBuffer.
     */
    readArrayBuffer(pointer: Deno.PointerValue, byteLength: number, offset?: number): ArrayBuffer
  }
}

const coreDenoTypes: Record<CTypeKind, Deno.NativeResultType> = {
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

const denoExtraTypes: Record<string, Deno.NativeResultType> = {
  'deno:usize': 'usize',
  'deno:isize': 'isize',
}

const allDenoTypes: Record<string, Deno.NativeResultType> = { ...coreDenoTypes, ...denoExtraTypes }

const StructDef = Symbol('unffi.deno.struct')
type StructCType = CType<Uint8Array> & { readonly [StructDef]: Deno.NativeStructType }

function isStructCType(t: CType<any>): t is StructCType {
  return (t as StructCType)[StructDef] !== undefined
}

function getDenoType(type: CType<any>): Deno.NativeType {
  if (isStructCType(type)) return type[StructDef]
  const kind = type.kind
  const mapped = allDenoTypes[kind]
  if (mapped !== undefined && mapped !== 'void') return mapped as Deno.NativeType
  if (mapped === 'void') return mapped as unknown as Deno.NativeType
  throw new Error(`[unffi/deno] Unsupported FFI type "${kind}". ${runtimeHint(kind, 'deno')}`)
}

function getDenoResultType(type: CType<any>): Deno.NativeResultType {
  if (isStructCType(type)) return type[StructDef]
  const kind = type.kind
  const mapped = allDenoTypes[kind]
  if (mapped !== undefined) return mapped
  throw new Error(`[unffi/deno] Unsupported FFI result type "${kind}". ${runtimeHint(kind, 'deno')}`)
}

const denoExtensions: DenoT['deno'] = {
  usize: { kind: 'deno:usize' } as unknown as CType<bigint>,
  isize: { kind: 'deno:isize' } as unknown as CType<bigint>,

  struct<const Fields extends readonly CType<any>[]>(fields: Fields): CType<Uint8Array> {
    const struct: Deno.NativeStructType = {
      struct: fields.map((f) => getDenoType(f)),
    }
    const token = { kind: 'pointer' as CTypeKind, [StructDef]: struct }
    return token as unknown as CType<Uint8Array>
  },

  ptrOf(view) { return Deno.UnsafePointer.of(view as ArrayBufferView) },
  readCString(pointer, offset) {
    if (pointer === null) throw new Error('[unffi/deno] readCString called with null pointer')
    return Deno.UnsafePointerView.getCString(pointer, offset)
  },
  readArrayBuffer(pointer, byteLength, offset) {
    if (pointer === null) throw new Error('[unffi/deno] readArrayBuffer called with null pointer')
    return Deno.UnsafePointerView.getArrayBuffer(pointer, byteLength, offset)
  },
}

export const t: DenoT = Object.assign({}, coreT, { deno: denoExtensions })

declare const TextEncoder: { new (): { encode(input: string): Uint8Array } }
const enc = new TextEncoder()

function encodeCStringPtr(s: string): { ptr: Deno.PointerValue; bytes: Uint8Array } {
  const bytes = enc.encode(s + '\0')
  return { ptr: Deno.UnsafePointer.of(bytes), bytes }
}

function decodeCStringResult(ptr: Deno.PointerValue): string | null {
  if (ptr === null) return null
  return Deno.UnsafePointerView.getCString(ptr)
}

export async function dlopen<const S extends SymbolsSchema>(path: string, schema: S): Promise<InferLibrary<S>> {
  const resolvedPath = await resolveLibraryPath(path, { extensions: [...libraryExtensions(), '.node'] })
  if (resolvedPath.endsWith('.node')) {
    const { dlopen: napiDlopen } = await import('./napi.js')
    return napiDlopen(resolvedPath, schema)
  }

  const denoSymbols: Record<string, Deno.ForeignFunction> = {}

  for (const [name, def] of Object.entries(schema)) {
    denoSymbols[name] = {
      parameters: def.args.map((a) => getDenoType(a)),
      result:     getDenoResultType(def.returns),
      ...(def.async && { nonblocking: true }),
    }
  }

  let lib: ReturnType<typeof Deno.dlopen>
  try {
    lib = Deno.dlopen(resolvedPath, denoSymbols)
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

  // NO FinalizationRegistry on UnsafeCallbacks. C may retain the
  // pointer after the JS function becomes unreachable (stored handler,
  // signal/atexit hook), so GC-driven free races with a live C-side caller.
  // Lifetime is bound to the library, freed in close().
  const callbacks = new Set<Deno.UnsafeCallback>()
  const wrappedSymbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name, def] of Object.entries(schema)) {
    const rawFn = (lib.symbols as Record<string, (...a: unknown[]) => unknown>)[name]

    if (!rawFn) throw new Error(`[unffi/deno] Symbol "${name}" not found in ${resolvedPath}`)

    const cstringInIdx = def.args
      .map((a, i) => (a.kind === 'cstring' ? i : -1))
      .filter((i) => i !== -1)
    const callbackIdx = def.args
      .map((a, i) => (a.kind === 'function' ? i : -1))
      .filter((i) => i !== -1)
    const returnsCstring = def.returns.kind === 'cstring'

    if (cstringInIdx.length === 0 && callbackIdx.length === 0 && !returnsCstring) {
      wrappedSymbols[name] = rawFn
      continue
    }

    wrappedSymbols[name] = (...args: unknown[]) => {
      const wrapped: unknown[] = [...args]
      const keepAlive: Uint8Array[] = []

      for (const i of cstringInIdx) {
        const v = wrapped[i]
        if (typeof v === 'string') {
          const { ptr, bytes } = encodeCStringPtr(v)
          keepAlive.push(bytes)
          wrapped[i] = ptr
        }
        // If the caller already passed a Deno.PointerValue (advanced path), leave it.
      }

      for (const i of callbackIdx) {
        const cb     = def.args[i] as CCallback<readonly CType<unknown>[], CType<unknown>>
        const userFn = wrapped[i] as (...a: unknown[]) => unknown

        const cbCstrIdx = cb.argTypes
          .map((a, j) => (a.kind === 'cstring' ? j : -1))
          .filter((j) => j !== -1)
        const cbReturnsCstring = cb.returnType.kind === 'cstring'

        const cbKeepAlive: Uint8Array[] = []

        const inner = (cbCstrIdx.length === 0 && !cbReturnsCstring)
          ? userFn
          : (...cbArgs: unknown[]) => {
            for (const j of cbCstrIdx) {
              const p = cbArgs[j] as Deno.PointerValue
              cbArgs[j] = p === null ? null : Deno.UnsafePointerView.getCString(p)
            }
            const r = userFn(...cbArgs)
            if (cbReturnsCstring && typeof r === 'string') {
              const bytes = enc.encode(r + '\0')
              cbKeepAlive.push(bytes)
              return Deno.UnsafePointer.of(bytes)
            }
            return r
          }

        const unsafeCb = new Deno.UnsafeCallback(
          {
            parameters: cb.argTypes.map((a) => getDenoType(a)),
            result:     getDenoResultType(cb.returnType),
          } as Deno.UnsafeCallbackDefinition,
          inner as Deno.UnsafeCallbackFunction,
        )
        callbacks.add(unsafeCb)
        wrapped[i] = unsafeCb.pointer
      }

      const result = rawFn(...wrapped)

      if (returnsCstring) {
        if (result instanceof Promise) {
          return result.then((r) => decodeCStringResult(r as Deno.PointerValue))
        }
        return decodeCStringResult(result as Deno.PointerValue)
      }

      // Touch keepAlive after the call so the optimiser cannot drop it.
      void keepAlive.length
      return result
    }
  }

  let closed = false
  function close() {
    if (closed) return  // idempotent: safe to call after `using` already disposed
    closed = true
    for (const cb of callbacks) cb.close()
    callbacks.clear()
    lib.close()
  }

  return {
    symbols: wrappedSymbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}
