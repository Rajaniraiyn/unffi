import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const unistdLibraryPaths = {
  env: 'UNFFI_UNISTD_PATH',
  candidates: ['libc.so.6'],
} as const

export const unistdSchema = {
  getuid: { args: [], returns: t.u32 },
  getgid: { args: [], returns: t.u32 },
  getppid: { args: [], returns: t.i32 },
  access: { args: [t.cstring, t.i32], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openUnistd(pathOverride?: string): Promise<InferLibrary<typeof unistdSchema>> {
  return dlopen(resolveBindingLibraryPathSync(unistdLibraryPaths, { platform: 'linux', pathOverride }), unistdSchema)
}
