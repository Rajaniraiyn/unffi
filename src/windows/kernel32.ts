import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const kernel32LibraryPaths = {
  env: 'UNFFI_KERNEL32_PATH',
  candidates: ['kernel32.dll'],
} as const

export const kernel32Schema = {
  GetCurrentProcessId: { args: [], returns: t.u32 },
  GetCurrentThreadId: { args: [], returns: t.u32 },
  GetTickCount64: { args: [], returns: t.u64 },
  lstrlenA: { args: [t.cstring], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openKernel32(pathOverride?: string): Promise<InferLibrary<typeof kernel32Schema>> {
  return dlopen(resolveBindingLibraryPathSync(kernel32LibraryPaths, { platform: 'win32', pathOverride }), kernel32Schema)
}
