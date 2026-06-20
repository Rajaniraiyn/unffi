import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const libcLibraryPaths = {
  env: 'UNFFI_LIBC_PATH',
  candidates: ['libc.so.6'],
} as const

export const libcSchema = {
  getpid: { args: [], returns: t.i32 },
  getppid: { args: [], returns: t.i32 },
  strlen: { args: [t.cstring], returns: t.u64 },
  strcmp: { args: [t.cstring, t.cstring], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openLibc(pathOverride?: string): Promise<InferLibrary<typeof libcSchema>> {
  return dlopen(resolveBindingLibraryPathSync(libcLibraryPaths, { platform: 'linux', pathOverride }), libcSchema)
}
