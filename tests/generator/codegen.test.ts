import { describe, expect, test } from 'bun:test'
import { generateLibraryModule } from '../../src/generator/codegen.js'
import { mapCType } from '../../src/generator/types.js'
import type { LibraryBinding } from '../../src/generator/ir.js'

describe('generator codegen', () => {
  test('emits schema, path metadata, and open helper', () => {
    const binding: LibraryBinding = {
      name: 'CoreFoundation',
      platform: 'macos',
      header: { path: 'CoreFoundation.h', language: 'c' },
      libraryNames: ['/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation'],
      env: 'UNFFI_COREFOUNDATION_PATH',
      declarations: [
        {
          kind: 'function',
          name: 'CFAbsoluteTimeGetCurrent',
          symbol: 'CFAbsoluteTimeGetCurrent',
          returns: mapCType('double'),
          args: [],
        },
        {
          kind: 'function',
          name: 'CFStringGetTypeID',
          symbol: 'CFStringGetTypeID',
          returns: mapCType('CFTypeID'),
          args: [],
        },
      ],
    }

    const code = generateLibraryModule(binding, { importPrefix: '../..' })

    expect(code).toContain('export const coreFoundationLibraryPaths')
    expect(code).toContain('UNFFI_COREFOUNDATION_PATH')
    expect(code).toContain('CFAbsoluteTimeGetCurrent: { args: [], returns: t.f64 }')
    expect(code).toContain('CFStringGetTypeID: { args: [], returns: t.u64 }')
    expect(code).toContain('export async function openCoreFoundation')
    expect(code).toContain('return dlopen(path, coreFoundationSchema)')
  })
})
