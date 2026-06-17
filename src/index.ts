// Fallback entry for environments that don't resolve export conditions.
// Bun/Deno/Node should get their dedicated adapter via package.json exports.
export { t } from './types.js'
export type { CType, CCallback, CTypeKind, Ptr, InferCType, InferTuple } from './types.js'
export type { SymbolDef, SymbolsSchema, InferLibrary, InferSymbolFn } from './define.js'

import type { SymbolsSchema, InferLibrary } from './define.js'

export async function dlopen<const S extends SymbolsSchema>(
  path: string,
  schema: S,
): Promise<InferLibrary<S>> {
  // ponytail: globalThis checks avoid direct Bun/Deno references that would error in Node
  if ('Bun' in globalThis) {
    const { dlopen: bunDlopen } = await import('./adapters/bun.js')
    return bunDlopen(path, schema)
  }
  if ('Deno' in globalThis) {
    const { dlopen: denoDlopen } = await import('./adapters/deno.js')
    return denoDlopen(path, schema)
  }
  const { dlopen: nodeDlopen } = await import('./adapters/node.js')
  return nodeDlopen(path, schema)
}
