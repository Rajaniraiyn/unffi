import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const pthreadLibraryPaths = {
  env: 'UNFFI_PTHREAD_PATH',
  candidates: ['libpthread.so.0'],
} as const

export const pthreadSchema = {
  pthread_self: { args: [], returns: t.u64 },
  pthread_equal: { args: [t.u64, t.u64], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openPthread(pathOverride?: string): Promise<InferLibrary<typeof pthreadSchema>> {
  return dlopen(resolveBindingLibraryPathSync(pthreadLibraryPaths, { platform: 'linux', pathOverride }), pthreadSchema)
}
