import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  libraryCandidates,
  libraryExtensions,
  resolveLibraryPathSync,
} from '../src/paths.js'

let tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('libraryExtensions', () => {
  test('returns the dynamic library extension for each supported platform', () => {
    expect(libraryExtensions('linux')).toEqual(['.so'])
    expect(libraryExtensions('darwin')).toEqual(['.dylib'])
    expect(libraryExtensions('win32')).toEqual(['.dll'])
  })
})

describe('libraryCandidates', () => {
  test('expands extensionless relative paths for linux', () => {
    expect(libraryCandidates('./libmath', { platform: 'linux' })).toEqual([
      './libmath.so',
      './libmath',
    ])
  })

  test('expands extensionless absolute paths for darwin', () => {
    expect(libraryCandidates('/tmp/libmath', { platform: 'darwin' })).toEqual([
      '/tmp/libmath.dylib',
      '/tmp/libmath',
    ])
  })

  test('expands extensionless relative paths for win32', () => {
    expect(libraryCandidates('.\\libmath', { platform: 'win32' })).toEqual([
      '.\\libmath.dll',
      '.\\libmath',
    ])
  })

  test('preserves explicit dynamic extensions without double-appending', () => {
    expect(libraryCandidates('./libmath.so', { platform: 'linux' })).toEqual([
      './libmath.so',
    ])
    expect(libraryCandidates('libc.so.6', { platform: 'linux' })).toEqual([
      'libc.so.6',
    ])
    expect(libraryCandidates('/tmp/libmath.dylib', { platform: 'darwin' })).toEqual([
      '/tmp/libmath.dylib',
    ])
    expect(libraryCandidates('C:\\libs\\math.dll', { platform: 'win32' })).toEqual([
      'C:\\libs\\math.dll',
    ])
  })

  test('treats .node as an explicit dynamic extension', () => {
    expect(libraryCandidates('./addon.node', { platform: 'linux' })).toEqual([
      './addon.node',
    ])
  })

  test('uses env search dirs only when env names are explicitly requested', () => {
    const envReader = (name: string) => ({
      LD_LIBRARY_PATH: '/env/one:/env/two',
      PATH: '/not/used',
    })[name]

    expect(libraryCandidates('libmath', { platform: 'linux', envReader })).toEqual([
      'libmath.so',
      'libmath',
    ])
    expect(libraryCandidates('libmath', { platform: 'linux', env: ['LD_LIBRARY_PATH'], envReader })).toEqual([
      'libmath.so',
      'libmath',
      '/env/one/libmath.so',
      '/env/one/libmath',
      '/env/two/libmath.so',
      '/env/two/libmath',
    ])
  })

  test('splits env search dirs with the platform delimiter', () => {
    const envReader = (name: string) => name === 'PATH' ? 'C:\\one;D:\\two' : undefined

    expect(libraryCandidates('math', { platform: 'win32', env: ['PATH'], envReader })).toEqual([
      'math.dll',
      'math',
      'C:\\one\\math.dll',
      'C:\\one\\math',
      'D:\\two\\math.dll',
      'D:\\two\\math',
    ])
  })

  test('orders searchDirs before systemDirs and dedupes without reordering', () => {
    expect(libraryCandidates('math', {
      platform: 'linux',
      searchDirs: ['/custom', '/system'],
      systemDirs: ['/system', '/fallback'],
    })).toEqual([
      'math.so',
      'math',
      '/custom/math.so',
      '/custom/math',
      '/system/math.so',
      '/system/math',
      '/fallback/math.so',
      '/fallback/math',
    ])
  })
})

describe('resolveLibraryPathSync', () => {
  test('returns an existing temp file path for extensionless input', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'unffi-paths-'))
    tempDirs.push(tempDir)
    const libraryPath = join(tempDir, 'libmath.so')
    await Bun.write(libraryPath, '')

    expect(resolveLibraryPathSync(join(tempDir, 'libmath'), { platform: 'linux' })).toBe(libraryPath)
  })

  test('returns the first bare fallback for a bare library name', () => {
    expect(resolveLibraryPathSync('libc', { platform: 'linux' })).toBe('libc.so')
  })

  test('returns versioned Linux sonames as explicit bare library names', () => {
    expect(resolveLibraryPathSync('libc.so.6', { platform: 'linux' })).toBe('libc.so.6')
  })

  test('prefers extensionless macOS framework shared-cache paths over addon candidates', () => {
    const frameworkPath = '/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation'

    expect(resolveLibraryPathSync(frameworkPath, {
      platform: 'darwin',
      extensions: ['.dylib', '.node'],
    })).toBe(frameworkPath)
  })

  test('throws with tried candidates when unresolved bare input is disallowed', () => {
    expect(() => resolveLibraryPathSync('missing', {
      platform: 'linux',
      allowBare: false,
    })).toThrow('Could not resolve dynamic library path for "missing". Tried: missing.so')
  })
})
