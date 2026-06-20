import type { InferLibrary, SymbolsSchema } from './define.js'
import { dlopen } from './index.js'
import { resolveLibraryPathSync } from './paths.js'
import { t } from './types.js'

interface MacOSLibraryPathSet {
  readonly env: string
  readonly candidates: readonly string[]
}

export const macosLibraryPaths = {
  libSystem: {
    env: 'UNFFI_LIBSYSTEM_PATH',
    candidates: [
      '/usr/lib/libSystem.B.dylib',
      'libSystem.B.dylib',
    ],
  },
  coreFoundation: {
    env: 'UNFFI_COREFOUNDATION_PATH',
    candidates: [
      '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation',
    ],
  },
} as const satisfies Record<string, MacOSLibraryPathSet>

export const macosLibSystemSchema = {
  getpid: { args: [], returns: t.i32 },
  strlen: { args: [t.cstring], returns: t.u64 },
  strcmp: { args: [t.cstring, t.cstring], returns: t.i32 },
  atoi: { args: [t.cstring], returns: t.i32 },
} as const satisfies SymbolsSchema

export const macosCoreFoundationSchema = {
  CFAbsoluteTimeGetCurrent: { args: [], returns: t.f64 },
  CFStringGetTypeID: { args: [], returns: t.u64 },
} as const satisfies SymbolsSchema

export async function openLibSystem(pathOverride?: string): Promise<InferLibrary<typeof macosLibSystemSchema>> {
  return dlopen(resolveMacOSLibraryPath(macosLibraryPaths.libSystem, pathOverride), macosLibSystemSchema)
}

export async function openCoreFoundation(pathOverride?: string): Promise<InferLibrary<typeof macosCoreFoundationSchema>> {
  return dlopen(resolveMacOSLibraryPath(macosLibraryPaths.coreFoundation, pathOverride), macosCoreFoundationSchema)
}

function resolveMacOSLibraryPath(paths: MacOSLibraryPathSet, pathOverride?: string): string {
  if (pathOverride) return resolveMacOSInput(pathOverride)

  const envOverride = process.env[paths.env]
  if (envOverride) return resolveMacOSInput(envOverride)

  return resolveMacOSCandidates(paths.candidates)
}

function resolveMacOSCandidates(candidates: readonly string[]): string {
  let lastError: unknown

  for (const candidate of candidates) {
    try {
      return resolveMacOSInput(candidate)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function resolveMacOSInput(input: string): string {
  try {
    return resolveLibraryPathSync(input, { platform: 'darwin' })
  } catch {
    // macOS system libraries may be present only in the dyld shared cache.
    return input
  }
}
