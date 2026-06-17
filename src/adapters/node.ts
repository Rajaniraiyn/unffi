import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CCallback, CType, CTypeKind } from '../types.js'
import { t } from '../types.js'

export type { InferLibrary }
export { t }

// ponytail: koffi uses string type names; i64/u64 auto-return BigInt
const toKoffiType: Record<CTypeKind, string> = {
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

type CallbackDef = { i: number; cb: CCallback<readonly CType<unknown>[], CType<unknown>> }

// ---------------------------------------------------------------------------
// Backend: native node:ffi (Node 26+ with --experimental-ffi)
// ---------------------------------------------------------------------------

// ponytail: node:ffi API is not stable yet — this is a forward-compat stub.
// Mapped types will need to be aligned once the API is finalised.
async function tryNativeNodeFFI(): Promise<'unavailable' | 'needs-flag' | object> {
  try {
    // @ts-expect-error — node:ffi has no published types yet (experimental future API)
    const nativeFfi = await import('node:ffi')
    return nativeFfi
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code
    // Module exists in this Node version but the --experimental-ffi flag wasn't passed
    if (code === 'ERR_EXPERIMENTAL_FEATURE_NOT_ENABLED') return 'needs-flag'
    // Not available in this Node version (< 26 or before feature landed)
    return 'unavailable'
  }
}

// ---------------------------------------------------------------------------
// Backend: koffi (optional peer, covers Node 18–25 and Node 26 without flag)
// ---------------------------------------------------------------------------

let _koffi: typeof import('koffi') | null = null

async function loadKoffi() {
  if (_koffi) return _koffi
  try {
    _koffi = (await import('koffi')).default as typeof import('koffi')
    return _koffi
  } catch {
    return null
  }
}

// Top-level await: resolve the backend once at module initialisation time
// so dlopen() stays synchronous for callers.
const backend = await (async () => {
  const native = await tryNativeNodeFFI()

  if (native === 'needs-flag') {
    // Runtime has node:ffi but the flag was not passed — hard error, no fallback.
    throw new Error(
      '[unffi] Node.js native FFI requires the --experimental-ffi flag.\n' +
      '  Run your script with: node --experimental-ffi <script.mjs>\n' +
      '  Docs: https://nodejs.org/api/ffi.html',
    )
  }

  if (native !== 'unavailable') {
    // node:ffi is available — use it.
    // ponytail: stub; replace with real node:ffi adapter when API is stable
    return { kind: 'node-native' as const, ffi: native }
  }

  // Fallback: koffi (optional peer dependency)
  const koffi = await loadKoffi()
  if (!koffi) {
    throw new Error(
      '[unffi] No FFI backend available for Node.js.\n' +
      '  Option 1 — install koffi (supports Node 18+):  npm install koffi\n' +
      '  Option 2 — Node 26+ with native FFI:            node --experimental-ffi <script.mjs>\n' +
      '  Docs: https://nodejs.org/api/ffi.html\n' +
      '        https://koffi.dev',
    )
  }

  return { kind: 'koffi' as const, ffi: koffi }
})()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open a shared library. Symbols are typed from the schema.
 * - Node 26+ with --experimental-ffi → native node:ffi
 * - Node 18–25 (or 26 without flag)  → koffi (optional peer dep)
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (backend.kind === 'koffi') {
    return koffiDlopen(backend.ffi, path, schema)
  }
  // ponytail: node-native backend — placeholder until node:ffi API stabilises
  throw new Error('[unffi] node:ffi native backend is detected but the adapter is not yet implemented. Use koffi for now.')
}

// ---------------------------------------------------------------------------
// koffi implementation
// ---------------------------------------------------------------------------

function koffiDlopen<const S extends SymbolsSchema>(
  koffi: typeof import('koffi'),
  path: string,
  schema: S,
): InferLibrary<S> {
  const lib = koffi.load(path)
  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name, def] of Object.entries(schema)) {
    const retType  = toKoffiType[def.returns.kind]
    const argTypes = def.args.map((a: CType<unknown>) => toKoffiType[a.kind])

    const callbackDefs = def.args
      .map((a: CType<unknown>, i: number) =>
        a.kind === 'function'
          ? { i, cb: a as CCallback<readonly CType<unknown>[], CType<unknown>> }
          : null,
      )
      .filter((x): x is CallbackDef => x !== null)

    // koffi supports synchronous FFI — no restriction on sync symbols
    const SUPPORTS_SYNC = true as const
    if (!SUPPORTS_SYNC && !def.async) throw new Error(
      `[unffi/node] Synchronous FFI is not supported in this runtime. Add \`async: true\` to "${name}".`,
    )

    const fn = lib.func(name, retType, argTypes)

    if (def.async) {
      symbols[name] = (...callArgs: unknown[]) => {
        const wrapped = wrapCallbacks(koffi, callArgs, callbackDefs)
        return new Promise<unknown>((resolve, reject) =>
          fn.async(...wrapped, (err: Error | null, result: unknown) =>
            err ? reject(err) : resolve(result),
          ),
        )
      }
    } else {
      symbols[name] = (...callArgs: unknown[]) =>
        fn(...wrapCallbacks(koffi, callArgs, callbackDefs))
    }
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

function wrapCallbacks(
  koffi: typeof import('koffi'),
  args: unknown[],
  defs: CallbackDef[],
): unknown[] {
  if (defs.length === 0) return args
  const wrapped = [...args]
  for (const { i, cb } of defs) {
    const proto = koffi.proto(
      `__unffi_cb_${i}_${Date.now()}`,
      toKoffiType[cb.returnType.kind],
      cb.argTypes.map((a: CType<unknown>) => toKoffiType[a.kind]),
    )
    wrapped[i] = koffi.register(args[i] as (...a: unknown[]) => unknown, proto)
  }
  return wrapped
}
