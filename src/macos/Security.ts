import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const securityLibraryPaths = {
  env: 'UNFFI_SECURITY_PATH',
  candidates: ['/System/Library/Frameworks/Security.framework/Security'],
} as const

export const securitySchema = {
  SecRandomCopyBytes: { args: [t.pointer, t.u64, t.buffer], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openSecurity(pathOverride?: string): Promise<InferLibrary<typeof securitySchema>> {
  return dlopen(resolveMacOSLibraryPath(pathOverride ?? process.env[securityLibraryPaths.env] ?? securityLibraryPaths.candidates[0]!), securitySchema)
}

function resolveMacOSLibraryPath(input: string): string {
  try {
    return resolveLibraryPathSync(input, { platform: 'darwin' })
  } catch {
    return input
  }
}
