import { existsSync } from 'node:fs'
import { isAbsolute, resolve, win32, posix } from 'node:path'

export type LibraryPlatform = 'linux' | 'darwin' | 'win32'

export interface LibraryPathOptions {
  readonly platform?: LibraryPlatform
  readonly cwd?: string
  readonly extensions?: readonly string[]
  readonly env?: readonly string[]
  readonly envReader?: (name: string) => string | undefined
  readonly searchDirs?: readonly string[]
  readonly systemDirs?: readonly string[]
  readonly allowBare?: boolean
}

export interface BindingLibraryPaths {
  readonly env?: string
  readonly candidates: readonly string[]
  readonly systemDirs?: readonly string[]
}

export interface BindingLibraryPathOptions {
  readonly platform?: LibraryPlatform
  readonly pathOverride?: string | undefined
  readonly envReader?: (name: string) => string | undefined
}

const DYNAMIC_EXTENSIONS = ['.so', '.dylib', '.dll', '.node'] as const

export function libraryExtensions(platform: LibraryPlatform = currentPlatform()): readonly string[] {
  if (platform === 'darwin') return ['.dylib']
  if (platform === 'win32') return ['.dll']
  return ['.so']
}

export function libraryCandidates(input: string, options: LibraryPathOptions = {}): string[] {
  const platform = options.platform ?? currentPlatform()
  const extensions = options.extensions ?? libraryExtensions(platform)
  const inputCandidates = inputVariants(input, extensions)
  const candidates: string[] = [...inputCandidates]

  if (isBareName(input)) {
    for (const dir of options.searchDirs ?? []) {
      candidates.push(...dirVariants(dir, inputCandidates, platform))
    }

    for (const dir of envDirs(options, platform)) {
      candidates.push(...dirVariants(dir, inputCandidates, platform))
    }

    for (const dir of options.systemDirs ?? []) {
      candidates.push(...dirVariants(dir, inputCandidates, platform))
    }
  }

  return dedupe(candidates)
}

export function resolveLibraryPathSync(input: string, options: LibraryPathOptions = {}): string {
  const platform = options.platform ?? currentPlatform()
  const cwd = options.cwd ?? process.cwd()
  const candidates = libraryCandidates(input, { ...options, platform })

  for (const candidate of candidates) {
    if (isPathCandidate(candidate) && existsSync(pathForExistence(candidate, cwd))) {
      return candidate
    }
    if (isMacOSSharedCacheCandidate(candidate, platform)) {
      return candidate
    }
  }

  if (isBareName(input)) {
    const bareCandidate = candidates.find(candidate => !isPathCandidate(candidate))
    if (bareCandidate && options.allowBare !== false) {
      return bareCandidate
    }
  }

  throw new Error(`Could not resolve dynamic library path for "${input}". Tried: ${candidates.join(', ')}`)
}

export async function resolveLibraryPath(input: string, options?: LibraryPathOptions): Promise<string> {
  return Promise.resolve(resolveLibraryPathSync(input, options))
}

export function resolveBindingLibraryPathSync(
  paths: BindingLibraryPaths,
  options: BindingLibraryPathOptions,
): string {
  const platform = options.platform ?? currentPlatform()
  const readEnv = options.envReader ?? ((name: string) => process.env[name])
  const inputs = options.pathOverride !== undefined
    ? [options.pathOverride]
    : [
        ...(paths.env !== undefined ? splitEnvValue(readEnv(paths.env), platform) : []),
        ...paths.candidates,
      ]

  let lastError: unknown
  for (const input of inputs) {
    try {
      return resolveLibraryPathSync(input, {
        platform,
        ...(paths.systemDirs !== undefined && { systemDirs: paths.systemDirs }),
      })
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error('Could not resolve dynamic library path: no candidates provided')
}

function currentPlatform(): LibraryPlatform {
  if (process.platform === 'darwin') return 'darwin'
  if (process.platform === 'win32') return 'win32'
  return 'linux'
}

function inputVariants(input: string, extensions: readonly string[]): string[] {
  if (hasDynamicExtension(input)) return [input]
  return [...extensions.map(extension => `${input}${extension}`), input]
}

function dirVariants(dir: string, candidates: readonly string[], platform: LibraryPlatform): string[] {
  return candidates.map(candidate => joinPath(platform, dir, basenameForPlatform(platform, candidate)))
}

function envDirs(options: LibraryPathOptions, platform: LibraryPlatform): string[] {
  const names = options.env ?? []
  const readEnv = options.envReader ?? ((name: string) => process.env[name])

  return names.flatMap(name => {
    return splitEnvValue(readEnv(name), platform)
  })
}

function splitEnvValue(value: string | undefined, platform: LibraryPlatform): string[] {
  if (!value) return []
  const separator = platform === 'win32' ? ';' : ':'
  return value.split(separator).filter(Boolean)
}

function hasDynamicExtension(path: string): boolean {
  const lower = path.toLowerCase()
  return DYNAMIC_EXTENSIONS.some(extension => lower.endsWith(extension))
    || /\.so(?:\.\d+)+$/.test(lower)
}

function isBareName(path: string): boolean {
  return !isAbsoluteForAnyPlatform(path) && !path.includes('/') && !path.includes('\\')
}

function isPathCandidate(path: string): boolean {
  return isAbsoluteForAnyPlatform(path)
    || path.startsWith('./')
    || path.startsWith('../')
    || path.startsWith('.\\')
    || path.startsWith('..\\')
    || path.includes('/')
    || path.includes('\\')
}

function isMacOSSharedCacheCandidate(path: string, platform: LibraryPlatform): boolean {
  return platform === 'darwin'
    && (path.startsWith('/usr/lib/') || path.startsWith('/System/Library/'))
    && !path.toLowerCase().endsWith('.node')
    && (!path.includes('.framework/') || !path.endsWith('.dylib'))
}

function isAbsoluteForAnyPlatform(path: string): boolean {
  return isAbsolute(path)
    || win32.isAbsolute(path)
    || /^[A-Za-z]:[\\/]/.test(path)
}

function pathForExistence(path: string, cwd: string): string {
  if (isAbsoluteForAnyPlatform(path)) return path
  return resolve(cwd, path)
}

function joinPath(platform: LibraryPlatform, dir: string, name: string): string {
  return platform === 'win32' ? win32.join(dir, name) : posix.join(dir, name)
}

function basenameForPlatform(platform: LibraryPlatform, path: string): string {
  return platform === 'win32' ? win32.basename(path) : posix.basename(path)
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)]
}
