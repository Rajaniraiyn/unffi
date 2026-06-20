import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveBindingLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const coreFoundationLibraryPaths = {
  env: 'UNFFI_COREFOUNDATION_PATH',
  candidates: ['/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation'],
} as const

export const coreFoundationSchema = {
  CFAbsoluteTimeGetCurrent: { args: [], returns: t.f64 },
  CFStringGetTypeID: { args: [], returns: t.u64 },
  CFRelease: { args: [t.pointer], returns: t.void },
} as const satisfies SymbolsSchema

export async function openCoreFoundation(pathOverride?: string): Promise<InferLibrary<typeof coreFoundationSchema>> {
  return dlopen(resolveBindingLibraryPathSync(coreFoundationLibraryPaths, { platform: 'darwin', pathOverride }), coreFoundationSchema)
}
