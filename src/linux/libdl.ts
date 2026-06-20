import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const libdlLibraryPaths = {
  env: 'UNFFI_LIBDL_PATH',
  candidates: ['libdl.so.2', 'libc.so.6'],
} as const

export const libdlSchema = {
  dlerror: { args: [], returns: t.cstring },
} as const satisfies SymbolsSchema

export async function openLibdl(pathOverride?: string): Promise<InferLibrary<typeof libdlSchema>> {
  const path = pathOverride ?? process.env[libdlLibraryPaths.env] ?? libdlLibraryPaths.candidates[0]!
  return dlopen(resolveLibraryPathSync(path, { platform: 'linux' }), libdlSchema)
}
