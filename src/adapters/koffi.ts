import koffi, { type IKoffiLib } from 'koffi'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

// ─── KoffiT — extends CoreT with koffi-specific FFI types ────────────────────
export interface KoffiT extends CoreT {
  readonly koffi: {
    /** UTF-16 string — for Windows APIs that use wide strings (koffi `str16`) */
    readonly str16:   CType<string>
    /** Pointer-sized unsigned integer, returns `bigint` (koffi `uintptr_t`) */
    readonly uintptr: CType<bigint>
    /** Pointer-sized signed integer, returns `bigint` (koffi `intptr_t`) */
    readonly intptr:  CType<bigint>
  }
}

// Derive koffi's non-exported TypeSpec from IKoffiLib.symbol (exported interface).
// TypeSpec = string | IKoffiCType — covers plain strings AND koffi composite types.
type KoffiTypeSpec = Parameters<IKoffiLib['symbol']>[1]

// ─── Core type map (exhaustive over CTypeKind) ────────────────────────────────
const coreKoffiTypes: Record<CTypeKind, KoffiTypeSpec> = {
  void:     'void',
  bool:     'bool',
  i8:       'int8',    i16: 'int16',   i32: 'int32',   i64: 'int64',
  u8:       'uint8',   u16: 'uint16',  u32: 'uint32',  u64: 'uint64',
  f32:      'float32', f64: 'float64',
  cstring:  'str',
  pointer:  'void *',
  buffer:   'void *',
  function: 'void *',
}

// ─── koffi-specific types ─────────────────────────────────────────────────────
// KoffiTypeSpec allows plain strings OR actual koffi type objects (struct, pointer, …)
const koffiExtraTypes: Record<string, KoffiTypeSpec> = {
  'koffi:str16':   'str16',      // UTF-16 string (Windows WinAPI)
  'koffi:uintptr': 'uintptr_t',  // pointer-sized unsigned integer → bigint
  'koffi:intptr':  'intptr_t',   // pointer-sized signed integer   → bigint
}

const allKoffiTypes: Record<string, KoffiTypeSpec> = { ...coreKoffiTypes, ...koffiExtraTypes }

export function getKoffiType(kind: string): KoffiTypeSpec {
  const type = allKoffiTypes[kind]
  if (type !== undefined) return type
  const hint =
    kind.startsWith('bun:')  ? 'This is a Bun-specific type — run with Bun. See https://bun.sh/docs/api/ffi' :
    kind.startsWith('deno:') ? 'This is a Deno-specific type — run with Deno. See https://docs.deno.com/runtime/fundamentals/ffi/' :
    'Unknown type kind.'
  throw new Error(`[unffi/koffi] Unsupported FFI type "${kind}". ${hint}`)
}

// ─── koffi-specific t extensions ──────────────────────────────────────────────
// Available on any runtime that resolves to this adapter (Node via export
// condition, or any runtime using koffi as the universal fallback).
const koffiExtensions = {
  /** UTF-16 string — for Windows APIs that use wide strings (koffi `str16`) */
  str16:   { kind: 'koffi:str16'   } as unknown as CType<string>,
  /** Pointer-sized unsigned integer, returns `bigint` (koffi `uintptr_t`) */
  uintptr: { kind: 'koffi:uintptr' } as unknown as CType<bigint>,
  /** Pointer-sized signed integer, returns `bigint` (koffi `intptr_t`) */
  intptr:  { kind: 'koffi:intptr'  } as unknown as CType<bigint>,
}

export const t: KoffiT = Object.assign({}, coreT, { koffi: koffiExtensions });

// ─── Implementation ───────────────────────────────────────────────────────────

type CallbackDef = { i: number; cb: CCallback<readonly CType<unknown>[], CType<unknown>> }

/**
 * Open a shared library using koffi.
 * Works on Node 18+ (and any other runtime where koffi is installed).
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const SUPPORTS_SYNC = true as const
  const lib = koffi.load(path)
  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name, def] of Object.entries(schema)) {
    if (!SUPPORTS_SYNC && !def.async) throw new Error(
      `[unffi/koffi] Synchronous FFI is not supported in this runtime. Add \`async: true\` to "${name}".`,
    )

    const retType  = getKoffiType(def.returns.kind)
    const argTypes = def.args.map((a: CType<unknown>) => getKoffiType(a.kind))
    const callbackDefs = def.args
      .map((a: CType<unknown>, i: number) =>
        a.kind === 'function' ? { i, cb: a as CCallback<readonly CType<unknown>[], CType<unknown>> } : null,
      )
      .filter((x): x is CallbackDef => x !== null)

    const fn = lib.func(name, retType, argTypes)

    symbols[name] = def.async
      ? (...callArgs: unknown[]) => {
          const wrapped = wrapCallbacks(callArgs, callbackDefs)
          return new Promise<unknown>((resolve, reject) =>
            fn.async(...wrapped, (err: Error | null, result: unknown) =>
              err ? reject(err) : resolve(result),
            ),
          )
        }
      : (...callArgs: unknown[]) => fn(...wrapCallbacks(callArgs, callbackDefs))
  }

  function close() {
    const maybeLib = lib as unknown as Record<string, unknown>
    if (typeof maybeLib['unload'] === 'function') {
      ;(maybeLib as unknown as { unload(): void }).unload()
    }
  }

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}

function wrapCallbacks(args: unknown[], defs: CallbackDef[]): unknown[] {
  if (defs.length === 0) return args
  const wrapped = [...args]
  for (const { i, cb } of defs) {
    const proto = koffi.proto(
      `__unffi_cb_${i}_${Date.now()}`,
      getKoffiType(cb.returnType.kind),
      cb.argTypes.map((a: CType<unknown>) => getKoffiType(a.kind)),
    )
    wrapped[i] = koffi.register(args[i] as (...a: unknown[]) => unknown, proto)
  }
  return wrapped
}
