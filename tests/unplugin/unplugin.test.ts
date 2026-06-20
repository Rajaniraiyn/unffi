import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  generateBindingModule,
  resolveVirtualBindingId,
  unplugin,
  virtualBindingId,
} from '../../src/unplugin.js'

describe('unffi unplugin integration', () => {
  test('builds stable virtual binding ids', () => {
    expect(virtualBindingId('math')).toBe('virtual:unffi/bindings/math')
    expect(resolveVirtualBindingId('virtual:unffi/bindings/math')).toBe('\0unffi:bindings:math')
    expect(resolveVirtualBindingId('other')).toBeNull()
  })

  test('generates a virtual module from a header entry', () => {
    const code = generateBindingModule({
      name: 'FixtureLib',
      header: resolve('tests/fixtures/headers/basic.h'),
      libraryNames: ['libfixture.so'],
      env: 'UNFFI_FIXTURE_PATH',
    })

    expect(code).toContain('export const fixtureLibSchema')
    expect(code).toContain('getpid: { args: [], returns: t.i32 }')
    expect(code).toContain('strlen: { args: [t.cstring], returns: t.u64 }')
    expect(code).toContain('strcmp: { args: [t.cstring, t.cstring], returns: t.i32 }')
    expect(code).toContain('dlopen: { args: [t.cstring, t.i32], returns: t.pointer }')
    expect(code).toContain('resolveBindingLibraryPathSync(fixtureLibLibraryPaths, { pathOverride })')
    expect(code).not.toContain('platform: "linux"')
    expect(code).toContain('export async function openFixtureLib')
  })

  test('caches generated virtual modules per plugin instance', async () => {
    type LoadablePlugin = {
      load?: (this: { warn(message: string): void }, id: string) => unknown | Promise<unknown>
    }
    const plugin = unplugin.raw({
      entries: [{
        name: 'fixture',
        header: resolve('tests/fixtures/headers/basic.h'),
        libraryNames: ['libfixture.so'],
      }],
    }, { framework: 'vite' } as never) as LoadablePlugin
    const id = '\0unffi:bindings:fixture'

    const first = await plugin.load?.call({ warn() {} } as never, id)
    const second = await plugin.load?.call({ warn() {} } as never, id)

    expect(first).toBe(second)
    expect(String(first)).toContain('export const fixtureSchema')
  })
})
