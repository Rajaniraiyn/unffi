import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { dlopen as koffiDlopen, t as koffiT, type KoffiT } from './koffi.js'

export type { InferLibrary, KoffiT }

// ─── node:ffi version gating ─────────────────────────────────────────────────
//
// node:ffi was introduced as --experimental-ffi in Node 26. We probed the API
// surface in 26.3.0:
//
//   import ffi from 'node:ffi'
//   ffi.dlopen(path, schema) → { lib: DynamicLibrary, functions, [Symbol.dispose] }
//   new ffi.DynamicLibrary(path)  → real instance with prototype methods
//   ffi.types: { VOID:'void', INT_32:'int32', INT_64:'int64', POINTER:'pointer', ... }
//   DynamicLibrary.prototype: functions, close, getFunction, getFunctions,
//                             getSymbol, getSymbols, registerCallback,
//                             unregisterCallback, refCallback, unrefCallback
//   lib[Symbol.dispose] present; lib[Symbol.asyncDispose] absent.
//
// Calling ABI in 26.3.0 is broken: every wrapped function reports
// `Invalid argument count: expected 0, got N` regardless of the parameter list
// in the schema. fn.length is always 0. Until that bug is fixed upstream we
// fall back to koffi and emit a warning so users know native FFI was detected
// but isn't usable yet.
//
// NODE_FFI_STABLE_VERSION: the first Node major where node:ffi can call
// C functions with typed arguments from JavaScript. Bump this once a release
// ships with the fix.
export const NODE_FFI_STABLE_VERSION = Infinity

// ─── Re-export koffi's t (KoffiT) — the primary backend on Node ──────────────
// Node adapter uses koffi for actual calls; users get KoffiT so they can opt
// into koffi-specific FFI types (t.koffi.str16, t.koffi.uintptr, ...).
export const t: KoffiT = koffiT

const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10)

type FfiState = 'unavailable' | 'needs-flag' | 'available-but-incomplete' | 'available'

// node:ffi module shape — derived from runtime probing, not redeclared here as
// type definitions (none are published yet). Kept narrow on purpose: we only
// touch the surface we actually use.
interface NodeFFIFunctionDef {
  parameters: readonly string[]
  result: string
}
interface NodeFFIDynamicLibrary {
  readonly functions: Record<string, (...args: unknown[]) => unknown>
  getFunction(name: string, def: NodeFFIFunctionDef): (...args: unknown[]) => unknown
  getFunctions(defs: Record<string, NodeFFIFunctionDef>): Record<string, (...args: unknown[]) => unknown>
  registerCallback(def: NodeFFIFunctionDef, fn: (...args: unknown[]) => unknown): unknown
  unregisterCallback(handle: unknown): void
  close(): void
  [Symbol.dispose](): void
}
interface NodeFFIModule {
  readonly DynamicLibrary: new (path: string) => NodeFFIDynamicLibrary
  dlopen(path: string): { lib: NodeFFIDynamicLibrary; functions: Record<string, never>; [Symbol.dispose](): void }
  dlopen(path: string, schema: Record<string, NodeFFIFunctionDef>): {
    lib: NodeFFIDynamicLibrary
    functions: Record<string, (...args: unknown[]) => unknown>
    [Symbol.dispose](): void
  }
  readonly types: Readonly<Record<string, string>>
}

let nodeFfi: NodeFFIModule | null = null

async function detectNodeFFI(): Promise<FfiState> {
  if (nodeMajor < 26) return 'unavailable'

  try {
    // @ts-expect-error — node:ffi has no published type definitions yet
    const mod = (await import('node:ffi')) as { default: NodeFFIModule } & NodeFFIModule
    nodeFfi = (mod.default ?? mod) as NodeFFIModule
    return nodeMajor >= NODE_FFI_STABLE_VERSION ? 'available' : 'available-but-incomplete'
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code
    // Node 26+ with flag missing: most builds report ERR_UNKNOWN_BUILTIN_MODULE
    // when --experimental-ffi isn't passed (the module is hidden until the flag
    // is set). Some builds may surface ERR_EXPERIMENTAL_FEATURE_NOT_ENABLED.
    if (code === 'ERR_EXPERIMENTAL_FEATURE_NOT_ENABLED') return 'needs-flag'
    if (code === 'ERR_UNKNOWN_BUILTIN_MODULE' && nodeMajor >= 26) return 'needs-flag'
    return 'unavailable'
  }
}

const ffiState = await detectNodeFFI()

if (ffiState === 'needs-flag') throw new Error(
  '[unffi] Node.js native FFI is available in this version but requires the --experimental-ffi flag.\n' +
  '  Run your script with: node --experimental-ffi <script.mjs>\n' +
  '  Docs: https://nodejs.org/api/ffi.html',
)

if (ffiState === 'available-but-incomplete') {
  process.emitWarning(
    `node:ffi is available in Node ${process.versions.node} but its function-call ABI is not ` +
    'yet complete (wrapped functions report "expected 0 arguments"). Falling back to koffi. ' +
    'Upgrade to a newer Node release once node:ffi stabilises.',
    'UnffiWarning',
  )
}

// ─── Type mapping: CTypeKind → node:ffi type string ──────────────────────────
// Derived directly from `ffi.types` at runtime (no manual redeclaration). The
// values in `ffi.types` are the strings that node:ffi's parameters/result
// fields accept, so we just map our CTypeKind onto the relevant entries.
const coreNodeFfiTypes: Record<CTypeKind, string> = {
  void:     'void',
  bool:     'bool',
  i8:       'int8',    i16: 'int16',   i32: 'int32',   i64: 'int64',
  u8:       'uint8',   u16: 'uint16',  u32: 'uint32',  u64: 'uint64',
  f32:      'float32', f64: 'float64',
  cstring:  'string',
  pointer:  'pointer',
  buffer:   'buffer',
  function: 'function',
}

function nodeFfiTypeFor(kind: string): string {
  const mapped = coreNodeFfiTypes[kind as CTypeKind]
  if (mapped !== undefined) return mapped
  const hint =
    kind.startsWith('bun:')  ? 'This is a Bun-specific type — run with Bun.' :
    kind.startsWith('deno:') ? 'This is a Deno-specific type — run with Deno.' :
    'Unknown type kind.'
  throw new Error(`[unffi/node] Unsupported FFI type "${kind}". ${hint}`)
}

// ─── Native node:ffi adapter ──────────────────────────────────────────────────

type CallbackDef = { i: number; cb: CCallback<readonly CType<unknown>[], CType<unknown>> }

function nativeDlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const ffi = nodeFfi
  if (!ffi) throw new Error('[unffi/node] node:ffi module not loaded')

  const ffiSchema: Record<string, NodeFFIFunctionDef> = {}
  const callbackDefs: Record<string, CallbackDef[]> = {}

  for (const [name, def] of Object.entries(schema)) {
    ffiSchema[name] = {
      parameters: def.args.map((a: CType<unknown>) => nodeFfiTypeFor(a.kind)),
      result:     nodeFfiTypeFor(def.returns.kind),
    }
    const cbs = def.args
      .map((a: CType<unknown>, i: number) =>
        a.kind === 'function' ? { i, cb: a as CCallback<readonly CType<unknown>[], CType<unknown>> } : null,
      )
      .filter((x): x is CallbackDef => x !== null)
    if (cbs.length > 0) callbackDefs[name] = cbs
  }

  const handle = ffi.dlopen(path, ffiSchema)
  const liveCallbacks: unknown[] = []
  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name, def] of Object.entries(schema)) {
    const rawFn = handle.functions[name]
    if (!rawFn) throw new Error(`[unffi/node] symbol "${name}" not found in ${path}`)
    const cbs = callbackDefs[name]

    if (def.async) {
      // node:ffi has no built-in async path yet — fall back to a Promise wrapper.
      symbols[name] = cbs
        ? (...callArgs: unknown[]) =>
            Promise.resolve().then(() => rawFn(...wrapCallbacks(handle.lib, callArgs, cbs, liveCallbacks)))
        : (...callArgs: unknown[]) => Promise.resolve().then(() => rawFn(...callArgs))
    } else {
      symbols[name] = cbs
        ? (...callArgs: unknown[]) => rawFn(...wrapCallbacks(handle.lib, callArgs, cbs, liveCallbacks))
        : (rawFn as (...a: unknown[]) => unknown)
    }
  }

  function close() {
    for (const h of liveCallbacks) handle.lib.unregisterCallback(h)
    liveCallbacks.length = 0
    handle.lib.close()
  }

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}

function wrapCallbacks(
  lib: NodeFFIDynamicLibrary,
  args: unknown[],
  defs: CallbackDef[],
  liveCallbacks: unknown[],
): unknown[] {
  const wrapped = [...args]
  for (const { i, cb } of defs) {
    const handle = lib.registerCallback(
      {
        parameters: cb.argTypes.map((a: CType<unknown>) => nodeFfiTypeFor(a.kind)),
        result:     nodeFfiTypeFor(cb.returnType.kind),
      },
      args[i] as (...a: unknown[]) => unknown,
    )
    liveCallbacks.push(handle)
    wrapped[i] = handle
  }
  return wrapped
}

// ─── dlopen ───────────────────────────────────────────────────────────────────

/**
 * Open a shared library on Node.js.
 *
 * Routing:
 *   Node >= NODE_FFI_STABLE_VERSION + --experimental-ffi → native node:ffi
 *   Node 26 + --experimental-ffi (ABI incomplete)        → koffi + warning
 *   Node < 26 or no flag                                 → koffi (optional peer dep)
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (ffiState === 'available') return nativeDlopen(path, schema)
  return koffiDlopen(path, schema)
}

// Surface CoreT for users that want the base type (re-exported for parity with
// other adapters that export their narrow runtime-specific T interface).
export type { CoreT }
