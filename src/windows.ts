import type { InferLibrary, SymbolsSchema } from './define.js'
import { dlopen } from './index.js'
import { resolveLibraryPathSync } from './paths.js'
import { t } from './types.js'

interface WindowsLibraryPathSet {
  readonly env: string
  readonly candidates: readonly string[]
}

const windowsSystemDirs = dedupe([
  process.env.SystemRoot ? `${process.env.SystemRoot}\\System32` : undefined,
  process.env.windir ? `${process.env.windir}\\System32` : undefined,
  'C:\\Windows\\System32',
  'C:\\Windows\\SysWOW64',
])

export const windowsLibraryPaths = {
  kernel32: {
    env: 'UNFFI_KERNEL32_PATH',
    candidates: [
      'kernel32.dll',
      ...windowsSystemDirs.map(dir => `${dir}\\kernel32.dll`),
    ],
  },
} as const satisfies Record<string, WindowsLibraryPathSet>

export const windowsKernel32Schema = {
  GetCurrentProcessId: { args: [], returns: t.u32 },
  GetCurrentThreadId:  { args: [], returns: t.u32 },
  GetTickCount64:      { args: [], returns: t.u64 },
  lstrlenA:            { args: [t.cstring], returns: t.i32 },
} as const satisfies SymbolsSchema

export async function openKernel32(pathOverride?: string): Promise<InferLibrary<typeof windowsKernel32Schema>> {
  return dlopen(resolveWindowsLibraryPath(windowsLibraryPaths.kernel32, pathOverride), windowsKernel32Schema)
}

function resolveWindowsLibraryPath(paths: WindowsLibraryPathSet, pathOverride?: string): string {
  if (pathOverride) return resolveWindowsInput(pathOverride)

  const envOverride = process.env[paths.env]
  if (envOverride) return resolveWindowsInput(envOverride)

  return resolveWindowsCandidates(paths.candidates)
}

function resolveWindowsCandidates(candidates: readonly string[]): string {
  let lastError: unknown

  for (const candidate of candidates) {
    try {
      return resolveWindowsInput(candidate)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function resolveWindowsInput(input: string): string {
  return resolveLibraryPathSync(input, {
    platform: 'win32',
    systemDirs: windowsSystemDirs,
  })
}

function dedupe(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))]
}
