import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind, CoreT } from '../types.js'
import { dlopen as koffiDlopen, t as koffiT, type KoffiT } from './koffi.js'
import { dlopen as napiDlopen } from './napi.js'
import { runtimeHint } from './hints.js'

export type { InferLibrary, KoffiT }

// node:ffi is stable in Node 26.3.0+
export const NODE_FFI_STABLE_VERSION = '26.3.0'

export const t: KoffiT = koffiT

const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10)
const nodeMinor = parseInt(process.versions.node.split('.')[1] ?? '0', 10)

type FfiState = 'unavailable' | 'needs-flag' | 'available-but-incomplete' | 'available'

interface NodeFFISignature {
  arguments: readonly string[]
  return: string
}

interface NodeFFIDynamicLibrary {
  readonly functions: Record<string, (...args: unknown[]) => unknown>
  readonly symbols: Record<string, bigint>
  getFunction(name: string, signature: NodeFFISignature): (...args: unknown[]) => unknown
  getFunctions(definitions: Record<string, NodeFFISignature>): Record<string, (...args: unknown[]) => unknown>
  registerCallback(signature?: NodeFFISignature, callback?: (...args: unknown[]) => unknown): bigint
  unregisterCallback(pointer: bigint): void
  close(): void
  readonly path: string
  [Symbol.dispose](): void
}

interface NodeFFIModule {
  dlopen(path: string, definitions: Record<string, NodeFFISignature>): {
    lib: NodeFFIDynamicLibrary
    functions: Record<string, (...args: unknown[]) => unknown>
  }
  toString(pointer: bigint): string | null
}

let nodeFfi: NodeFFIModule | null = null

async function detectNodeFFI(): Promise<FfiState> {
  if (nodeMajor < 26) return 'unavailable'

  try {
    // @ts-expect-error — node:ffi has no published type definitions yet
    const mod = (await import('node:ffi')) as { default: NodeFFIModule } & NodeFFIModule
    nodeFfi = (mod.default ?? mod) as NodeFFIModule
    return (nodeMajor > 26 || (nodeMajor === 26 && nodeMinor >= 3)) ? 'available' : 'available-but-incomplete'
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
    'Upgrade to Node 26.3.0 or later once node:ffi stabilises.',
    'UnffiWarning',
  )
}

const coreNodeFfiTypes: Record<string, string> = {
  void:     'void',
  bool:     'bool',
  i8:       'i8',      i16: 'i16',   i32: 'i32',   i64: 'i64',
  u8:       'u8',      u16: 'u16',   u32: 'u32',   u64: 'u64',
  f32:      'f32',     f64: 'f64',
  cstring:  'string',
  pointer:  'pointer',
  buffer:   'buffer',
  function: 'function',
  // koffi compatibility types
  'koffi:uintptr': 'u64',
  'koffi:intptr':  'i64',
  'koffi:str16':   'string',
}

function nodeFfiTypeFor(kind: string): string {
  const mapped = coreNodeFfiTypes[kind]
  if (mapped !== undefined) return mapped
  throw new Error(`[unffi/node] Unsupported FFI type "${kind}". ${runtimeHint(kind, 'node')}`)
}

type CallbackDef = { i: number; cb: CCallback<readonly CType<unknown>[], CType<unknown>> }

function nativeDlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const ffi = nodeFfi as NodeFFIModule
  if (!nodeFfi) throw new Error('[unffi/node] node:ffi module not loaded')

  const ffiSchema: Record<string, NodeFFISignature> = {}
  const callbackDefs: Record<string, CallbackDef[]> = {}

  for (const [name, def] of Object.entries(schema)) {
    ffiSchema[name] = {
      arguments: def.args.map((a: CType<unknown>) => nodeFfiTypeFor(a.kind)),
      return:     nodeFfiTypeFor(def.returns.kind),
    }
    const cbs = def.args
      .map((a: CType<unknown>, i: number) =>
        a.kind === 'function' ? { i, cb: a as CCallback<readonly CType<unknown>[], CType<unknown>> } : null,
      )
      .filter((x): x is CallbackDef => x !== null)
    if (cbs.length > 0) callbackDefs[name] = cbs
  }

  const { lib, functions } = ffi.dlopen(path, ffiSchema)
  const liveCallbacks: bigint[] = []
  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name, def] of Object.entries(schema)) {
    const rawFn = functions[name]
    if (!rawFn) throw new Error(`[unffi/node] symbol "${name}" not found in ${path}`)
    const cbs = callbackDefs[name]
    const returnsCstring = def.returns.kind === 'cstring'
    const returnsBool = def.returns.kind === 'bool'
    const needsWrap = returnsCstring || returnsBool

    function convertResult(r: unknown): unknown {
      if (returnsCstring) return decodeCString(ffi, r as bigint)
      if (returnsBool) return Boolean(r)
      return r
    }

    if (def.async) {
      if (cbs) {
        symbols[name] = (...callArgs: unknown[]) =>
          Promise.resolve().then(() => {
            const r = rawFn(...wrapCallbacks(ffi, lib, callArgs, cbs, liveCallbacks))
            return convertResult(r)
          })
      } else if (needsWrap) {
        symbols[name] = (...callArgs: unknown[]) =>
          Promise.resolve().then(() => {
            const r = rawFn(...callArgs)
            return convertResult(r)
          })
      } else {
        symbols[name] = (...callArgs: unknown[]) => Promise.resolve().then(() => rawFn(...callArgs))
      }
    } else {
      if (cbs) {
        symbols[name] = (...callArgs: unknown[]) => {
          const r = rawFn(...wrapCallbacks(ffi, lib, callArgs, cbs, liveCallbacks))
          return convertResult(r)
        }
      } else if (needsWrap) {
        symbols[name] = (...callArgs: unknown[]) => {
          const r = rawFn(...callArgs)
          return convertResult(r)
        }
      } else {
        symbols[name] = rawFn as (...a: unknown[]) => unknown
      }
    }
  }

  // NO FinalizationRegistry on node:ffi callbacks. C owns the
  // function pointer indefinitely; GC-driven unregister races with a live
  // C-side caller. Lifetime is bound to the library, freed in close().
  let closed = false
  function close() {
    if (closed) return  // idempotent: safe to call after `using` already disposed
    closed = true
    for (const h of liveCallbacks) lib.unregisterCallback(h)
    liveCallbacks.length = 0
    lib.close()
  }

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}

function decodeCString(ffi: NodeFFIModule, ptr: bigint): string | null {
  if (ptr === 0n) return null
  return ffi.toString(ptr)
}

function wrapCallbacks(
  ffi: NodeFFIModule,
  lib: NodeFFIDynamicLibrary,
  args: unknown[],
  defs: CallbackDef[],
  liveCallbacks: bigint[],
): unknown[] {
  const wrapped = [...args]
  for (const { i, cb } of defs) {
    const userFn = args[i] as (...a: unknown[]) => unknown
    const cbCstrIdx = cb.argTypes
      .map((a: CType<unknown>, j: number) => (a.kind === 'cstring' ? j : -1))
      .filter((j: number) => j !== -1)

    const wrappedFn = cbCstrIdx.length === 0
      ? userFn
      : (...cbArgs: unknown[]) => {
          for (const j of cbCstrIdx) {
            const p = cbArgs[j] as bigint
            cbArgs[j] = p === 0n ? null : ffi.toString(p)
          }
          return userFn(...cbArgs)
        }

    const handle = lib.registerCallback(
      {
        arguments: cb.argTypes.map((a: CType<unknown>) => nodeFfiTypeFor(a.kind)),
        return:     nodeFfiTypeFor(cb.returnType.kind),
      },
      wrappedFn,
    )
    liveCallbacks.push(handle)
    wrapped[i] = handle
  }
  return wrapped
}

export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (path.endsWith('.node')) return napiDlopen(path, schema)
  if (ffiState === 'available') return nativeDlopen(path, schema)
  return koffiDlopen(path, schema)
}

export type { CoreT }
