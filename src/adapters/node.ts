import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { dlopen as koffiDlopen, t as koffiT, type KoffiT } from './koffi.js'
import { runtimeHint } from './hints.js'

export type { InferLibrary, KoffiT }

// node:ffi ABI broken in Node 26.3.0 (every call reports "expected 0 arguments").
// Bump once a release ships the fix.
export const NODE_FFI_STABLE_VERSION = Infinity

export const t: KoffiT = koffiT

const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10)

type FfiState = 'unavailable' | 'needs-flag' | 'available-but-incomplete' | 'available'

interface NodeFFIFunctionDef {
  parameters: readonly string[]
  result: string
}
interface NodeFFIDynamicLibrary {
  readonly functions: Record<string, (...args: unknown[]) => unknown>
  registerCallback(def: NodeFFIFunctionDef, fn: (...args: unknown[]) => unknown): unknown
  unregisterCallback(handle: unknown): void
  close(): void
}
interface NodeFFIModule {
  dlopen(path: string, schema: Record<string, NodeFFIFunctionDef>): {
    lib: NodeFFIDynamicLibrary
    functions: Record<string, (...args: unknown[]) => unknown>
  }
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
  throw new Error(`[unffi/node] Unsupported FFI type "${kind}". ${runtimeHint(kind, 'node')}`)
}

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

  // NO FinalizationRegistry on node:ffi callbacks. C owns the
  // function pointer indefinitely; GC-driven unregister races with a live
  // C-side caller. Lifetime is bound to the library, freed in close().
  let closed = false
  function close() {
    if (closed) return  // idempotent: safe to call after `using` already disposed
    closed = true
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

export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (ffiState === 'available') return nativeDlopen(path, schema)
  return koffiDlopen(path, schema)
}

export type { CoreT }
