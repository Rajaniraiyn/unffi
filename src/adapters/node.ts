import type { SymbolsSchema, InferLibrary } from '../define.js'
import { dlopen as koffiDlopen, t } from './koffi.js'

export type { InferLibrary }
export { t }

// ─── node:ffi version gating ─────────────────────────────────────────────────
//
// node:ffi was introduced as --experimental-ffi in Node 26.
// As of Node 26.3.0 the function-call ABI is incomplete (all wrapped
// functions report "expected 0 arguments" regardless of parameter count).
// We gate on a future version constant that will be updated once
// the calling convention is confirmed to work end-to-end.
//
// NODE_FFI_STABLE_VERSION: the first Node version where node:ffi can call
// C functions with typed arguments from JavaScript.
// Set to Infinity until confirmed; update when a working version ships.
const NODE_FFI_STABLE_VERSION = Infinity

const nodeMajor = parseInt(process.versions.node.split('.')[0]!, 10)

async function detectNodeFFI(): Promise<'unavailable' | 'needs-flag' | 'available-but-incomplete' | 'available'> {
  if (nodeMajor < 26) return 'unavailable'

  try {
    // @ts-expect-error — node:ffi has no published type definitions yet
    await import('node:ffi')
    // Module loaded — but is the calling ABI complete?
    return nodeMajor >= NODE_FFI_STABLE_VERSION ? 'available' : 'available-but-incomplete'
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code
    // node:ffi exists in this Node version but --experimental-ffi flag not passed
    if (code === 'ERR_EXPERIMENTAL_FEATURE_NOT_ENABLED') return 'needs-flag'
    return 'unavailable'
  }
}

const ffiState = await detectNodeFFI()

// Node 26+ with flag present but calling ABI not yet usable → don't block startup,
// but emit a warning so users know native FFI was detected but isn't usable yet.
if (ffiState === 'needs-flag') throw new Error(
  '[unffi] Node.js native FFI is available in this version but requires the --experimental-ffi flag.\n' +
  '  Run your script with: node --experimental-ffi <script.mjs>\n' +
  '  Docs: https://nodejs.org/api/ffi.html',
)

if (ffiState === 'available-but-incomplete') {
  process.emitWarning(
    'node:ffi is available but the function-call ABI is not yet complete in this Node version. ' +
    'Falling back to koffi. Upgrade to a newer Node release once node:ffi stabilises.',
    'UnffiWarning',
  )
}

// ─── dlopen ───────────────────────────────────────────────────────────────────

/**
 * Open a shared library.
 *
 * Routing:
 *   Node >= NODE_FFI_STABLE_VERSION + --experimental-ffi → native node:ffi
 *   Node 26 + --experimental-ffi (ABI incomplete)        → koffi + warning
 *   Node < 26 or no flag                                 → koffi (optional peer dep)
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (ffiState === 'available') {
    // node:ffi calling ABI confirmed working — adapter implementation goes here.
    // See src/adapters/koffi.ts for the pattern to follow.
    throw new Error(
      '[unffi] node:ffi native adapter is ready to be implemented. ' +
      'The infrastructure is in place — wire up DynamicLibrary.getFunctions().',
    )
  }
  return koffiDlopen(path, schema)
}
