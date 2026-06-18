import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CoreT } from '../types.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

export interface NapiT extends CoreT {
  readonly napi: Record<string, never>
}

export const t = coreT as NapiT

const IS_DENO = 'Deno' in globalThis

function loadAddon(path: string): Record<string, unknown> {
  const mod = { exports: {} as Record<string, unknown>, id: path, filename: path }
  process.dlopen(mod, path, 0)
  return mod.exports
}

export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  if (!path.endsWith('.node')) {
    throw new Error(
      `[unffi/napi] NAPI adapter only supports .node files. Got: "${path}".\n` +
      '  Use the node/deno adapter for .so / .dylib shared libraries.',
    )
  }

  let addon: Record<string, unknown>
  try {
    addon = loadAddon(path)
  } catch (e: unknown) {
    if (IS_DENO) {
      throw new Error(
        `[unffi/napi] Failed to load native addon "${path}".\n` +
        '  Deno requires --allow-ffi to load .node native addons.\n' +
        '  Run with: deno run --allow-ffi <script>\n' +
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