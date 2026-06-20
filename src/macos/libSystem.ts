import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const libSystemLibraryPaths = {
  env: 'UNFFI_LIBSYSTEM_PATH',
  candidates: ['/usr/lib/libSystem.B.dylib', 'libSystem.B.dylib'],
} as const

export const libSystemSchema = {
  getpid: { args: [], returns: t.i32 },
  strlen: { args: [t.cstring], returns: t.u64 },
  strcmp: { args: [t.cstring, t.cstring], returns: t.i32 },
  atoi: { args: [t.cstring], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openLibSystem(pathOverride?: string): Promise<InferLibrary<typeof libSystemSchema>> {
  return dlopen(resolveMacOSLibraryPath(pathOverride ?? process.env[libSystemLibraryPaths.env] ?? libSystemLibraryPaths.candidates[0]!), libSystemSchema)
}

function resolveMacOSLibraryPath(input: string): string {
  try {
    return resolveLibraryPathSync(input, { platform: 'darwin' })
  } catch {
    return input
  }
}
