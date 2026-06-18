import { createRequire } from 'module'
import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CoreT } from '../types.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

export interface NapiT extends CoreT {
  readonly napi: {
    // NAPI addons don't need custom types — the schema is for
    // TypeScript inference only. These exist for API consistency.
  }
}

export const t = coreT as NapiT

const _require = createRequire(import.meta.url)

export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (!path.endsWith('.node')) {
    throw new Error(
      `[unffi/napi] NAPI adapter only supports .node files. Got: "${path}".\n` +
      '  Use the node adapter for .so / .dylib shared libraries.',
    )
  }

  let addon: Record<string, unknown>
  try {
    addon = _require(path) as Record<string, unknown>
  } catch (e: unknown) {
    throw new Error(
      `[unffi/napi] Failed to load native addon "${path}".\n` +
      `  ${(e as Error).message}`,
    )
  }

  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name] of Object.entries(schema)) {
    const fn = addon[name]
    if (typeof fn !== 'function') {
      throw new Error(
        `[unffi/napi] Symbol "${name}" not found or not a function in "${path}".\n` +
        `  Available exports: ${Object.keys(addon).join(', ') || '(none)'}`,
      )
    }
    symbols[name] = fn as (...args: unknown[]) => unknown
  }

  let closed = false
  function close() {
    if (closed) return
    closed = true
    // NAPI addons cannot be unloaded in Node.js.
    // close() is idempotent for interface consistency.
  }

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}
