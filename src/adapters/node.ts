import type { SymbolsSchema, InferLibrary } from '../define.js'
import { dlopen as koffiDlopen, t } from './koffi.js'

export type { InferLibrary }
export { t }

// ─── Native node:ffi detection ────────────────────────────────────────────────

async function tryNativeNodeFFI(): Promise<'unavailable' | 'needs-flag' | object> {
  try {
    // @ts-expect-error — node:ffi has no published types yet (experimental future API)
    return await import('node:ffi')
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ERR_EXPERIMENTAL_FEATURE_NOT_ENABLED') return 'needs-flag'
    return 'unavailable'
  }
}

const native = await tryNativeNodeFFI()

if (native === 'needs-flag') throw new Error(
  '[unffi] Node.js native FFI requires the --experimental-ffi flag.\n' +
  '  Run your script with: node --experimental-ffi <script.mjs>\n' +
  '  Docs: https://nodejs.org/api/ffi.html',
)

// ─── dlopen ───────────────────────────────────────────────────────────────────

/**
 * Open a shared library.
 * - Node 26+ with --experimental-ffi → native node:ffi (stub until API stabilises)
 * - All other Node versions           → koffi (optional peer dep)
 */
export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (native !== 'unavailable') {
    // ponytail: node:ffi stub — replace once API is stable
    throw new Error('[unffi] node:ffi native backend detected but not yet implemented. Use koffi for now.')
  }
  return koffiDlopen(path, schema)
}
