import type { InferLibrary, SymbolsSchema } from '../define.js'
import { dlopen } from '../index.js'
import { resolveLibraryPathSync } from '../paths.js'
import { t } from '../types.js'

export const systemConfigurationLibraryPaths = {
  env: 'UNFFI_SYSTEMCONFIGURATION_PATH',
  candidates: ['/System/Library/Frameworks/SystemConfiguration.framework/SystemConfiguration'],
} as const

export const systemConfigurationSchema = {
  SCDynamicStoreCopyProxies: { args: [], returns: t.pointer },
} as const satisfies SymbolsSchema

export async function openSystemConfiguration(pathOverride?: string): Promise<InferLibrary<typeof systemConfigurationSchema>> {
  return dlopen(resolveMacOSLibraryPath(pathOverride ?? process.env[systemConfigurationLibraryPaths.env] ?? systemConfigurationLibraryPaths.candidates[0]!), systemConfigurationSchema)
}

function resolveMacOSLibraryPath(input: string): string {
  try {
    return resolveLibraryPathSync(input, { platform: 'darwin' })
  } catch {
    return input
  }
}
