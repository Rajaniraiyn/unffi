import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const libmLibraryPaths = {
  env: 'UNFFI_LIBM_PATH',
  candidates: ['libm.so.6'],
} as const

export const libmSchema = {
  cos: { args: [t.f64], returns: t.f64 },
  sin: { args: [t.f64], returns: t.f64 },
  sqrt: { args: [t.f64], returns: t.f64 },
  fabs: { args: [t.f64], returns: t.f64 },
} as const satisfies SymbolsSchema

export async function openLibm(pathOverride?: string): Promise<InferLibrary<typeof libmSchema>> {
  return dlopen(resolveBindingLibraryPathSync(libmLibraryPaths, { platform: 'linux', pathOverride }), libmSchema)
}
