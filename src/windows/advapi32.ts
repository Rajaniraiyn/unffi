import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const advapi32LibraryPaths = {
  env: 'UNFFI_ADVAPI32_PATH',
  candidates: ['advapi32.dll'],
} as const

export const advapi32Schema = {
  GetUserNameA: { args: [t.buffer, t.buffer], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openAdvapi32(pathOverride?: string): Promise<InferLibrary<typeof advapi32Schema>> {
  return dlopen(resolveBindingLibraryPathSync(advapi32LibraryPaths, { platform: 'win32', pathOverride }), advapi32Schema)
}
