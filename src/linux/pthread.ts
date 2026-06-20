import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const pthreadLibraryPaths = {
  env: 'UNFFI_PTHREAD_PATH',
  candidates: ['libpthread.so.0', 'libc.so.6'],
} as const

export const pthreadSchema = {
  pthread_self: { args: [], returns: t.u64 },
  pthread_equal: { args: [t.u64, t.u64], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openPthread(pathOverride?: string): Promise<InferLibrary<typeof pthreadSchema>> {
  const path = pathOverride ?? process.env[pthreadLibraryPaths.env] ?? pthreadLibraryPaths.candidates[0]!
  return dlopen(resolveLibraryPathSync(path, { platform: 'linux' }), pthreadSchema)
}
