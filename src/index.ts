// Fallback entry for environments that don't resolve export conditions.
// Bun, Deno, and Node should get their dedicated adapters via package.json exports.
export { t } from './types.js'
export type { CType, CCallback, CTypeKind, Ptr, InferCType, InferTuple } from './types.js'
export type { SymbolDef, SymbolsSchema, InferLibrary, InferSymbolFn } from './define.js'

import type { SymbolsSchema, InferLibrary } from './define.js'

export async function dlopen<const S extends SymbolsSchema>(
  path: string,
  schema: S,
): Promise<InferLibrary<S>> {
  if ('Bun' in globalThis) {
    const { dlopen: bunDlopen } = await import('./adapters/bun.js')
    return bunDlopen(path, schema)
  }
  if ('Deno' in globalThis) {
    const { dlopen: denoDlopen } = await import('./adapters/deno.js')
    return denoDlopen(path, schema)
  }
  // Universal fallback: koffi works on Node 18+ and any other JS runtime with npm support
  const { dlopen: koffiDlopen } = await import('./adapters/koffi.js')
  return koffiDlopen(path, schema)
}
