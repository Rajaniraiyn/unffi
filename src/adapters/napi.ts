import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CoreT } from '../types.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

export interface NapiT extends CoreT {
  readonly napi: {
    // NAPI addons don't need custom types — the schema is for
    // TypeScript inference only.
  }
}

export const t = coreT as NapiT

const IS_DENO = 'Deno' in globalThis

// Load node:module at runtime. Works on Node (built-in) and
// Deno (native compat). The any-cast sidesteps Deno's type system
// which doesn't declare node:* modules.
const mod: { createRequire(url: string): (id: string) => unknown } = await (
  // @ts-ignore — TS2591 under Deno types
  import('node:module') as Promise<any>
)
const _require = mod.createRequire(
  // @ts-ignore — TS2339 under Deno types
  import.meta.url,
)

export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (!path.endsWith('.node')) {
    throw new Error(
      `[unffi/napi] NAPI adapter only supports .node files. Got: "${path}".\n` +
      '  Use the node/deno adapter for .so / .dylib shared libraries.',
    )
  }

  let addon: Record<string, unknown>
  try {
    addon = _require(path) as Record<string, unknown>
  } catch (e: unknown) {
    if (IS_DENO) {
      throw new Error(
        `[unffi/napi] Failed to load native addon "${path}".\n` +
        '  Deno requires --allow-ffi to load .node native addons.\n' +
        '  Run with: deno run --allow-ffi <script>\n' +
        '  If --allow-ffi is set, ensure node_modules are installed.\n' +
        `  ${(e as Error).message}`,
      )
    }
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
  }

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}
