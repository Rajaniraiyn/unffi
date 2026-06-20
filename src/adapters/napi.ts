import type { SymbolsSchema, InferLibrary } from '../define.js'
import type { CoreT } from '../types.js'
import { resolveLibraryPathSync } from '../paths.js'
import { t as coreT } from '../types.js'

export type { InferLibrary }

export interface NapiT extends CoreT {
  readonly napi: Record<string, never>
}

export const t = coreT as NapiT

const IS_DENO = 'Deno' in globalThis

function loadAddon(path: string): Record<string, unknown> {
  const mod = { exports: {} as Record<string, unknown>, id: path, filename: path }
  process.dlopen(mod, path, 1)
  return mod.exports
}

export function dlopen<const S extends SymbolsSchema>(path: string, schema: S): InferLibrary<S> {
  const resolvedPath = resolveLibraryPathSync(path, { extensions: ['.node'] })
  if (!resolvedPath.endsWith('.node')) {
    throw new Error(
      `[unffi/napi] NAPI adapter only supports .node files. Got: "${resolvedPath}".\n` +
      '  Use the node/deno adapter for .so / .dylib shared libraries.',
    )
  }

  let addon: Record<string, unknown>
  try {
    addon = loadAddon(resolvedPath)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (IS_DENO) {
      throw new Error(
        `[unffi/napi] Failed to load native addon "${resolvedPath}".\n` +
        '  Deno requires --allow-ffi to load .node native addons.\n' +
        '  Run with: deno run --allow-ffi <script>\n' +
        `  ${msg}`,
      )
    }
    throw new Error(
      `[unffi/napi] Failed to load native addon "${resolvedPath}".\n  ${msg}`,
    )
  }

  const symbols: Record<string, (...args: unknown[]) => unknown> = {}

  for (const [name] of Object.entries(schema)) {
    const fn = addon[name]
    if (typeof fn !== 'function') {
      throw new Error(
        `[unffi/napi] Symbol "${name}" not found or not a function in "${resolvedPath}".\n` +
        `  Available exports: ${Object.keys(addon).join(', ') || '(none)'}`,
      )
    }
    symbols[name] = fn as (...args: unknown[]) => unknown
  }

  function close() {}

  return {
    symbols: symbols as InferLibrary<S>['symbols'],
    close,
    [Symbol.dispose]: close,
    [Symbol.asyncDispose]() { return Promise.resolve(close()) },
  }
}