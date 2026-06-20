import { statSync } from 'node:fs'
import type { InferLibrary, SymbolsSchema } from './define.js'
import { dlopen } from './index.js'
import { resolveLibraryPathSync } from './paths.js'
import { t } from './types.js'

interface LinuxLibraryPathSet {
  readonly env: string
  readonly bare: string
  readonly candidates: readonly string[]
  readonly systemDirs: readonly string[]
}

const ubuntuLibraryDirs = [
  '/lib/x86_64-linux-gnu',
  '/usr/lib/x86_64-linux-gnu',
  '/lib/aarch64-linux-gnu',
  '/usr/lib/aarch64-linux-gnu',
  '/lib/arm-linux-gnueabihf',
  '/usr/lib/arm-linux-gnueabihf',
  '/lib64',
  '/usr/lib64',
] as const

export const linuxLibraryPaths = {
  libc: linuxPathSet('UNFFI_LIBC_PATH', 'libc.so.6'),
  libm: linuxPathSet('UNFFI_LIBM_PATH', 'libm.so.6'),
} as const

export const linuxLibcSchema = {
  getpid: { args: [], returns: t.i32 },
  strlen: { args: [t.cstring], returns: t.u64 },
  strcmp: { args: [t.cstring, t.cstring], returns: t.i32 },
} as const satisfies SymbolsSchema

export const linuxLibmSchema = {
  cos:  { args: [t.f64], returns: t.f64 },
  sqrt: { args: [t.f64], returns: t.f64 },
} as const satisfies SymbolsSchema

export async function openLibc(pathOverride?: string): Promise<InferLibrary<typeof linuxLibcSchema>> {
  return dlopen(resolveLinuxLibraryPath(linuxLibraryPaths.libc, pathOverride), linuxLibcSchema)
}

export async function openLibm(pathOverride?: string): Promise<InferLibrary<typeof linuxLibmSchema>> {
  return dlopen(resolveLinuxLibraryPath(linuxLibraryPaths.libm, pathOverride), linuxLibmSchema)
}

function linuxPathSet(env: string, bare: string): LinuxLibraryPathSet {
  return {
    env,
    bare,
    candidates: [bare, ...ubuntuLibraryDirs.map(dir => `${dir}/${bare}`)],
    systemDirs: ubuntuLibraryDirs,
  }
}

function resolveLinuxLibraryPath(paths: LinuxLibraryPathSet, pathOverride?: string): string {
  if (pathOverride) return resolveLinuxInput(pathOverride, paths)

  const envOverride = process.env[paths.env]
  if (envOverride) return resolveLinuxEnvOverride(envOverride, paths)

  return resolveLinuxInput(paths.bare, paths)
}

function resolveLinuxEnvOverride(value: string, paths: LinuxLibraryPathSet): string {
  const values = value.split(':').filter(Boolean)
  const searchDirs = values.filter(isDirectorySearchValue)
  const directValues = values.filter(item => !isDirectorySearchValue(item))

  if (directValues.length > 0) {
    return resolveLinuxInput(directValues[0]!, paths)
  }

  return resolveLibraryPathSync(paths.bare, {
    platform: 'linux',
    searchDirs,
    systemDirs: paths.systemDirs,
  })
}

function resolveLinuxInput(input: string, paths: LinuxLibraryPathSet): string {
  return resolveLibraryPathSync(input, {
    platform: 'linux',
    systemDirs: paths.systemDirs,
  })
}

function isDirectorySearchValue(value: string): boolean {
  if (!value.includes('/')) return false
  if (/\.so(?:\.\d+)*$/.test(value)) return false

  try {
    return statSync(value).isDirectory()
  } catch {
    return false
  }
}
