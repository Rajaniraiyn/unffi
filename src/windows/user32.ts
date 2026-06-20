import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const user32LibraryPaths = {
  env: 'UNFFI_USER32_PATH',
  candidates: ['user32.dll'],
} as const

export const user32Schema = {
  GetSystemMetrics: { args: [t.i32], returns: t.i32 },
  GetDoubleClickTime: { args: [], returns: t.u32 },
} as const satisfies SymbolsSchema

export async function openUser32(pathOverride?: string): Promise<InferLibrary<typeof user32Schema>> {
  return dlopen(resolveBindingLibraryPathSync(user32LibraryPaths, { platform: 'win32', pathOverride }), user32Schema)
}
