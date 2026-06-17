import koffi, { type IKoffiLib, type IKoffiCType } from 'koffi'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

// ─── Type derivation from koffi's own declarations ────────────────────────────
// TypeSpec is not exported — derive it from IKoffiLib.symbol's signature so
// we stay in lock-step with whatever koffi declares (`string | IKoffiCType`).
type KoffiTypeSpec = Parameters<IKoffiLib['symbol']>[1]

// Struct field map — derived from koffi.struct so we never duplicate the
// underlying TypeSpecWithAlignment union.
type KoffiStructDef = Parameters<typeof koffi.struct>[0] extends infer P
  ? P extends Record<string, unknown> ? P : Record<string, KoffiTypeSpec>
  : Record<string, KoffiTypeSpec>

// Array hint — koffi.d.ts has overlapping overloads so `Parameters<typeof koffi.array>[2]`
// resolves to the wrong member. Hardcoded to koffi's `ArrayHint` literal union.
type KoffiArrayHint = 'Array' | 'Typed' | 'String'

// ─── CType extension: carry an IKoffiCType payload alongside `kind` ───────────
// User-facing API stays identical (everything is a `CType<T>`), but composite
// koffi types (struct, array, pointer, out, …) need to round-trip the native
// `IKoffiCType` object. We attach it via a WeakMap keyed by the CType.
const nativeKoffiType = new WeakMap<CType<unknown>, IKoffiCType>()

function brand<T>(native: IKoffiCType): CType<T> {
  // `kind` is informational for koffi-native types — the WeakMap lookup is
  // what drives `getKoffiType`. The tag still helps error messages and any
  // external introspection.
  const ct = { kind: 'koffi:native' as CTypeKind } as CType<T>
  nativeKoffiType.set(ct as CType<unknown>, native)
  return ct
}

// ─── KoffiT — extends CoreT with koffi-specific FFI types ────────────────────
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

// ─── Core kind → koffi TypeSpec map (exhaustive over CTypeKind sans `function`) ─
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

/** Resolve a CType (or raw kind string) to a koffi TypeSpec the loader can use. */
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
  // 'function' is handled inline in dlopen (a proto-pointer is built per
  // callback slot, then registered per call site).
  if (kind === 'function') return 'void *'
  if (kind === 'koffi:native') {
    throw new Error('[unffi/koffi] Internal: koffi:native type missing IKoffiCType payload')
  }
  const hint =
    kind.startsWith('bun:')  ? 'This is a Bun-specific type — run with Bun.'   :
    kind.startsWith('deno:') ? 'This is a Deno-specific type — run with Deno.' :
    'Unknown type kind.'
  throw new Error(`[unffi/koffi] Unsupported FFI type "${kind}". ${hint}`)
}

function toSpec(ref: CType<unknown> | KoffiTypeSpec): KoffiTypeSpec {
  if (typeof ref === 'string') return ref
  if (ref !== null && typeof ref === 'object' && '__brand' in (ref as object)) return ref as IKoffiCType
  return getKoffiType(ref as CType<unknown>)
}

/** Promote a value-type spec to a pointer-to-value spec (no-op if already a pointer). */
function asPointer(ref: CType<unknown> | KoffiTypeSpec): IKoffiCType {
  const spec = toSpec(ref)
  if (typeof spec === 'string') {
    // Already a pointer-shaped type (`void *`, `char *`, `str`, `str16`, …)?
    if (spec.endsWith('*') || spec === 'str' || spec === 'str16' || spec === 'str32') {
      return koffi.pointer(spec)  // koffi.pointer accepts a string spec
    }
    return koffi.pointer(spec)
  }
  return koffi.pointer(spec)
}

// ─── koffi-specific t extensions ──────────────────────────────────────────────
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
    // Two-arg form picks the (ref, len: number, hint?) overload unambiguously.
    const native = hint === undefined
      ? koffi.array(toSpec(ref), len)
      : koffi.array(toSpec(ref), len, hint)
    return brand<T[]>(native)
  },

  pointer<T>(ref: CType<T> | KoffiTypeSpec): CType<T> {
    return brand<T>(koffi.pointer(toSpec(ref)))
  },

  out<T>(ref: CType<T> | KoffiTypeSpec): CType<[T]> {
    // koffi.out wraps a *pointer* type; if the user passed a value type (e.g.
    // `t.i32`), promote it to a pointer first so the call site can write into
    // a caller-provided 1-element array.
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
    // koffi.encode mutates a ref buffer; we synthesise one large enough for
    // the value (plus NUL terminator for char-style types).
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

// ─── Implementation ───────────────────────────────────────────────────────────

type CallbackDef = { i: number; cb: CCallback<readonly CType<unknown>[], CType<unknown>> }

let cbCounter = 0

/**
 * Open a shared library using koffi.
 * Works on Node 18+ (and any other runtime where koffi is installed).
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const lib = koffi.load(path)
  const symbols: Record<string, (...args: unknown[]) => unknown> = {}
  const registered: IKoffiCType[] = []  // tracked for koffi.unregister() on close()

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
        // koffi requires the callback arg-type to be a *pointer to* the proto,
        // and `koffi.register` also expects the pointer type — not the proto.
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

  function close() {
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
