import koffi, { type IKoffiLib } from 'koffi'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind } from '../types.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

// Derive koffi's non-exported TypeSpec from IKoffiLib.symbol (which IS exported).
// TypeSpec = string | IKoffiCType — covers plain strings AND koffi struct/pointer/array types.
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

// ─── Node-specific types ──────────────────────────────────────────────────────
// KoffiTypeSpec allows string names OR actual koffi type objects (struct, pointer, …)
const nodeKoffiTypes: Record<string, KoffiTypeSpec> = {
  'node:str16':   'str16',      // UTF-16 string (Windows WinAPI)
  'node:uintptr': 'uintptr_t',  // pointer-sized unsigned integer
  'node:intptr':  'intptr_t',   // pointer-sized signed integer
}

const allKoffiTypes: Record<string, KoffiTypeSpec> = { ...coreKoffiTypes, ...nodeKoffiTypes }

function getKoffiType(kind: string): KoffiTypeSpec {
  const type = allKoffiTypes[kind]
  if (type !== undefined) return type
  const hint =
    kind.startsWith('bun:')  ? 'This is a Bun-specific type — run with Bun. See https://bun.sh/docs/api/ffi' :
    kind.startsWith('deno:') ? 'This is a Deno-specific type — run with Deno. See https://docs.deno.com/runtime/fundamentals/ffi/' :
    'Unknown type kind.'
  throw new Error(`[unffi/node] Unsupported FFI type "${kind}". ${hint}`)
}

// ─── Node-specific t extensions ───────────────────────────────────────────────
// These are only available when resolved via the "node" export condition.
const nodeExtensions = {
  /** UTF-16 string — for Windows APIs that use wide strings (koffi `str16`) */
  str16:   { kind: 'node:str16'   } as unknown as CType<string>,
  /** Pointer-sized unsigned integer, returns `bigint` (koffi `uintptr_t`) */
  uintptr: { kind: 'node:uintptr' } as unknown as CType<bigint>,
  /** Pointer-sized signed integer, returns `bigint` (koffi `intptr_t`) */
  intptr:  { kind: 'node:intptr'  } as unknown as CType<bigint>,
}

export const t = Object.assign({}, coreT, { node: nodeExtensions })

// ─── Type helpers ─────────────────────────────────────────────────────────────

type CallbackDef = { i: number; cb: CCallback<readonly CType<unknown>[], CType<unknown>> }

// ─── Backend detection ────────────────────────────────────────────────────────

async function tryNativeNodeFFI(): Promise<'unavailable' | 'needs-flag' | object> {
  try {
    // @ts-expect-error — node:ffi has no published types yet (experimental future API)
    const nativeFfi = await import('node:ffi')
    return nativeFfi
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ERR_EXPERIMENTAL_FEATURE_NOT_ENABLED') return 'needs-flag'
    return 'unavailable'
  }
}

let _koffi: typeof import('koffi') | null = null
async function loadKoffi() {
  if (_koffi) return _koffi
  try {
    _koffi = (await import('koffi')).default as typeof import('koffi')
    return _koffi
  } catch { return null }
}

// Top-level await: resolve backend once at module init so dlopen() stays synchronous
const backend = await (async () => {
  const native = await tryNativeNodeFFI()

  if (native === 'needs-flag') throw new Error(
    '[unffi] Node.js native FFI requires the --experimental-ffi flag.\n' +
    '  Run your script with: node --experimental-ffi <script.mjs>\n' +
    '  Docs: https://nodejs.org/api/ffi.html',
  )

  if (native !== 'unavailable') {
    // ponytail: node:ffi stub — replace once API is stable
    return { kind: 'node-native' as const, ffi: native }
  }

  const koffi = await loadKoffi()
  if (!koffi) throw new Error(
    '[unffi] No FFI backend available for Node.js.\n' +
    '  Option 1 — install koffi (supports Node 18+):  npm install koffi\n' +
    '  Option 2 — Node 26+ with native FFI:            node --experimental-ffi <script.mjs>\n' +
    '  Docs: https://nodejs.org/api/ffi.html | https://koffi.dev',
  )

  return { kind: 'koffi' as const, ffi: koffi }
})()

// ─── dlopen ───────────────────────────────────────────────────────────────────

/**
 * Open a shared library. Symbols are typed from the schema.
 * - Node 26+ with --experimental-ffi → native node:ffi
 * - Node 18–25 (or 26 without flag)  → koffi (optional peer dep)
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (backend.kind === 'koffi') return koffiDlopen(backend.ffi, path, schema)
  // ponytail: node-native stub — replace once node:ffi API is stable
  throw new Error('[unffi] node:ffi native backend detected but not yet implemented. Install koffi for now.')
}

// ─── koffi implementation ─────────────────────────────────────────────────────

function koffiDlopen<const S extends SymbolsSchema>(
  koffi: typeof import('koffi'),
  path: string,
  schema: S,
): InferLibrary<S> {
  const SUPPORTS_SYNC = true as const
  const lib = koffi.load(path)
  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name, def] of Object.entries(schema)) {
    if (!SUPPORTS_SYNC && !def.async) throw new Error(
      `[unffi/node] Synchronous FFI is not supported in this runtime. Add \`async: true\` to "${name}".`,
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
          const wrapped = wrapCallbacks(koffi, callArgs, callbackDefs)
          return new Promise<unknown>((resolve, reject) =>
            fn.async(...wrapped, (err: Error | null, result: unknown) =>
              err ? reject(err) : resolve(result),
            ),
          )
        }
      : (...callArgs: unknown[]) => fn(...wrapCallbacks(koffi, callArgs, callbackDefs))
  }

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close() {
      const maybeLib = lib as unknown as Record<string, unknown>
      if (typeof maybeLib['unload'] === 'function') {
        ;(maybeLib as unknown as { unload(): void }).unload()
      }
    },
  }
}

function wrapCallbacks(koffi: typeof import('koffi'), args: unknown[], defs: CallbackDef[]): unknown[] {
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
