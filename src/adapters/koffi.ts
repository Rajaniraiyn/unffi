import koffi, { type IKoffiLib, type IKoffiCType } from 'koffi'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { t as coreT } from '../types.js'
import { runtimeHint } from './hints.js'

export type { InferLibrary }

type KoffiTypeSpec = Parameters<IKoffiLib['symbol']>[1]

type KoffiStructDef = Parameters<typeof koffi.struct>[0] extends infer P
  ? P extends Record<string, unknown> ? P : Record<string, KoffiTypeSpec>
  : Record<string, KoffiTypeSpec>

// koffi.d.ts overlapping overloads make Parameters<typeof koffi.array>[2] resolve wrong
type KoffiArrayHint = 'Array' | 'Typed' | 'String'

const nativeKoffiType = new WeakMap<CType<unknown>, IKoffiCType>()

function brand<T>(native: IKoffiCType): CType<T> {
  const ct = { kind: 'koffi:native' as CTypeKind } as CType<T>
  nativeKoffiType.set(ct as CType<unknown>, native)
  return ct
}

export interface KoffiT extends CoreT {
  readonly koffi: {
    /** UTF-16 string — for Windows APIs that use wide strings (koffi `str16`). */
    readonly str16:   CType<string>
    /** Pointer-sized unsigned integer, returns `bigint` (koffi `uintptr_t`). */
    readonly uintptr: CType<bigint>
    /** Pointer-sized signed integer, returns `bigint`  (koffi `intptr_t`). */
    readonly intptr:  CType<bigint>
    /** Build a struct type from a field map.
     *
     * ```ts
     * const Point = t.koffi.struct<{ x: number; y: number }>({ x: 'float64', y: 'float64' })
     * ``` */
    struct<T = Record<string, unknown>>(def: KoffiStructDef): CType<T>
    struct<T = Record<string, unknown>>(name: string, def: KoffiStructDef): CType<T>
    /** Build a fixed-length array type. */
    array<T = unknown>(ref: CType<T> | KoffiTypeSpec, len: number, hint?: KoffiArrayHint): CType<T[]>
    /** Build a pointer-to-type. */
    pointer<T>(ref: CType<T> | KoffiTypeSpec): CType<T>
    /** Mark a parameter as output-only (caller passes a 1-element array; koffi writes index 0). */
    out<T>(ref: CType<T> | KoffiTypeSpec): CType<[T]>
    /** Mark a parameter as input+output. */
    inout<T>(ref: CType<T> | KoffiTypeSpec): CType<[T]>
    /** Opaque pointer type (foreign handle). */
    opaque(name?: string): CType<unknown>
    /** Alias a type under a new name. */
    alias<T>(name: string, ref: CType<T> | KoffiTypeSpec): CType<T>
    /** Encode a JS string into an ArrayBuffer of the given type (default `str` / UTF-8). */
    encode(value: string, type?: KoffiTypeSpec): ArrayBuffer
    /** Decode a pointer / buffer back to a JS value. */
    decode<T = unknown>(ref: unknown, type: CType<T> | KoffiTypeSpec): T
    /** Free memory allocated by `koffi.alloc` or returned as `disposable`. */
    free(ref: unknown): void
    /** Direct access to the raw koffi module (escape hatch). */
    readonly raw: typeof koffi
  }
}

const coreKoffiTypes: Record<Exclude<CTypeKind, 'function'>, KoffiTypeSpec> = {
  void:    'void',
  bool:    'bool',
  i8:      'int8',    i16: 'int16',   i32: 'int32',   i64: 'int64',
  u8:      'uint8',   u16: 'uint16',  u32: 'uint32',  u64: 'uint64',
  f32:     'float32', f64: 'float64',
  cstring: 'str',     // koffi auto-encodes/decodes UTF-8 string ↔ char* (verified)
  pointer: 'void *',
  buffer:  'void *',  // TypedArrays are passed zero-copy (verified — fill_buf mutates caller's Int32Array)
}

const koffiNamedExtras: Record<string, KoffiTypeSpec> = {
  'koffi:str16':   'str16',
  'koffi:uintptr': 'uintptr_t',
  'koffi:intptr':  'intptr_t',
}

export function getKoffiType(type: CType<unknown> | string): KoffiTypeSpec {
  if (typeof type !== 'string') {
    const native = nativeKoffiType.get(type as CType<unknown>)
    if (native !== undefined) return native
    return resolveKind(type.kind)
  }
  return resolveKind(type)
}

function resolveKind(kind: string): KoffiTypeSpec {
  if (kind in coreKoffiTypes) return coreKoffiTypes[kind as keyof typeof coreKoffiTypes]
  if (kind in koffiNamedExtras) return koffiNamedExtras[kind]!
  if (kind === 'function') return 'void *'
  if (kind === 'koffi:native') throw new Error('[unffi/koffi] Internal: koffi:native type missing IKoffiCType payload')
  throw new Error(`[unffi/koffi] Unsupported FFI type "${kind}". ${runtimeHint(kind, 'node')}`)
}

function toSpec(ref: CType<unknown> | KoffiTypeSpec): KoffiTypeSpec {
  if (typeof ref === 'string') return ref
  if (ref !== null && typeof ref === 'object' && '__brand' in (ref as object)) return ref as IKoffiCType
  return getKoffiType(ref as CType<unknown>)
}

function asPointer(ref: CType<unknown> | KoffiTypeSpec): IKoffiCType {
  return koffi.pointer(toSpec(ref))
}

const koffiExtensions: KoffiT['koffi'] = {
  str16:   { kind: 'koffi:str16'   } as unknown as CType<string>,
  uintptr: { kind: 'koffi:uintptr' } as unknown as CType<bigint>,
  intptr:  { kind: 'koffi:intptr'  } as unknown as CType<bigint>,

  struct<T>(a: string | KoffiStructDef, b?: KoffiStructDef): CType<T> {
    const native = (typeof a === 'string')
      ? koffi.struct(a, b!)
      : koffi.struct(a as KoffiStructDef)
    return brand<T>(native)
  },

  array<T>(ref: CType<T> | KoffiTypeSpec, len: number, hint?: KoffiArrayHint): CType<T[]> {
    const native = hint === undefined
      ? koffi.array(toSpec(ref), len)
      : koffi.array(toSpec(ref), len, hint)
    return brand<T[]>(native)
  },

  pointer<T>(ref: CType<T> | KoffiTypeSpec): CType<T> {
    return brand<T>(koffi.pointer(toSpec(ref)))
  },

  out<T>(ref: CType<T> | KoffiTypeSpec): CType<[T]> {
    return brand<[T]>(koffi.out(asPointer(ref)))
  },

  inout<T>(ref: CType<T> | KoffiTypeSpec): CType<[T]> {
    return brand<[T]>(koffi.inout(asPointer(ref)))
  },

  opaque(name?: string): CType<unknown> {
    return brand<unknown>(name === undefined ? koffi.opaque() : koffi.opaque(name))
  },

  alias<T>(name: string, ref: CType<T> | KoffiTypeSpec): CType<T> {
    return brand<T>(koffi.alias(name, toSpec(ref)))
  },

  encode(value: string, type: KoffiTypeSpec = 'str'): ArrayBuffer {
    const slot = koffi.sizeof(type)
    const size = slot > 0 ? Math.max(slot, value.length + 1) : value.length + 1
    const buf  = new ArrayBuffer(size)
    koffi.encode(buf, type, value)
    return buf
  },

  decode<T>(ref: unknown, type: CType<T> | KoffiTypeSpec): T {
    return koffi.decode(ref, toSpec(type)) as T
  },

  free: koffi.free,
  raw: koffi,
}

export const t: KoffiT = Object.assign({}, coreT, { koffi: koffiExtensions })

type CallbackDef = { i: number; cb: CCallback<readonly CType<unknown>[], CType<unknown>> }

let cbCounter = 0

export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const lib = koffi.load(path)
  const symbols: Record<string, (...args: unknown[]) => unknown> = {}
  const registered: IKoffiCType[] = []

  for (const [name, def] of Object.entries(schema)) {
    // Per-callback proto-pointer types, indexed by arg position.
    const callbackDefs: CallbackDef[] = []
    const cbPointerTypes: Record<number, IKoffiCType> = {}

    const argTypes: KoffiTypeSpec[] = def.args.map((a: CType<unknown>, i: number) => {
      if (a.kind === 'function') {
        const cb = a as CCallback<readonly CType<unknown>[], CType<unknown>>
        callbackDefs.push({ i, cb })
        const proto = koffi.proto(
          `__unffi_cb_${name}_${i}_${++cbCounter}`,
          getKoffiType(cb.returnType),
          cb.argTypes.map((tt: CType<unknown>) => getKoffiType(tt)),
        )
        const ptr = koffi.pointer(proto)
        cbPointerTypes[i] = ptr
        return ptr
      }
      return getKoffiType(a)
    })

    const retType = getKoffiType(def.returns)
    const fn = lib.func(name, retType, argTypes)

    symbols[name] = def.async
      ? (...callArgs: unknown[]) => {
          const wrapped = wrapCallbacks(callArgs, callbackDefs, cbPointerTypes, registered)
          return new Promise<unknown>((resolve, reject) =>
            fn.async(...wrapped, (err: Error | null, result: unknown) =>
              err ? reject(err) : resolve(result),
            ),
          )
        }
      : (...callArgs: unknown[]) => fn(...wrapCallbacks(callArgs, callbackDefs, cbPointerTypes, registered))
  }

  // NO FinalizationRegistry on koffi callbacks. C owns the function
  // pointer indefinitely (stored callbacks, signal handlers, etc.); GC-driven
  // unregister races with a live C-side caller. Lifetime is bound to the
  // library and released in close().
  let closed = false
  function close() {
    if (closed) return  // idempotent: safe to call after `using` already disposed
    closed = true
    for (const reg of registered) {
      try { koffi.unregister(reg as unknown as Parameters<typeof koffi.unregister>[0]) } catch { /* already gone */ }
    }
    registered.length = 0
    const maybeLib = lib as unknown as { unload?: () => void }
    if (typeof maybeLib.unload === 'function') maybeLib.unload()
  }

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}

function wrapCallbacks(
  args: unknown[],
  defs: CallbackDef[],
  ptrTypes: Record<number, IKoffiCType>,
  registered: IKoffiCType[],
): unknown[] {
  if (defs.length === 0) return args
  const wrapped = [...args]
  for (const { i } of defs) {
    const userFn = args[i] as (...a: unknown[]) => unknown
    const reg = koffi.register(userFn, ptrTypes[i]!)
    registered.push(reg as unknown as IKoffiCType)
    wrapped[i] = reg
  }
  return wrapped
}
