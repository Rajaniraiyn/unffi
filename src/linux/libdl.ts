import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const libdlLibraryPaths = {
  env: 'UNFFI_LIBDL_PATH',
  candidates: ['libdl.so.2'],
} as const

export const libdlSchema = {
  dlerror: { args: [], returns: t.cstring },
} as const satisfies SymbolsSchema

export async function openLibdl(pathOverride?: string): Promise<InferLibrary<typeof libdlSchema>> {
  return dlopen(resolveBindingLibraryPathSync(libdlLibraryPaths, { platform: 'linux', pathOverride }), libdlSchema)
}
