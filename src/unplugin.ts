import { createUnplugin } from 'unplugin'
import type { HeaderSource, LibraryBinding } from './generator/ir.js'
import { generateLibraryModule } from './generator/codegen.js'
import { parseHeaderWithClang } from './generator/parser.js'

export interface UnffiBindingEntry {
  readonly name: string
  readonly header: string
  readonly language?: HeaderSource['language']
  readonly includeDirs?: readonly string[]
  readonly defines?: HeaderSource['defines']
  readonly libraryNames: readonly string[]
  readonly env?: string
  readonly platform?: LibraryBinding['platform']
}

export interface UnffiPluginOptions {
  readonly entries: readonly UnffiBindingEntry[]
  readonly diagnostics?: 'silent' | 'warn' | 'error'
  readonly clangPath?: string
}

const virtualPrefix = 'virtual:unffi/bindings/'
const resolvedPrefix = '\0unffi:bindings:'

export function virtualBindingId(name: string): string {
  return `${virtualPrefix}${name}`
}

export function resolveVirtualBindingId(id: string): string | null {
  if (id.startsWith(virtualPrefix)) return `${resolvedPrefix}${id.slice(virtualPrefix.length)}`
  return null
}

export function generateBindingModule(entry: UnffiBindingEntry, options: Pick<UnffiPluginOptions, 'clangPath'> = {}): string {
  const header: HeaderSource = {
    path: entry.header,
    language: entry.language ?? (entry.header.endsWith('.hpp') || entry.header.endsWith('.hxx') ? 'c++' : 'c'),
    ...(entry.includeDirs !== undefined && { includeDirs: entry.includeDirs }),
    ...(entry.defines !== undefined && { defines: entry.defines }),
  }
  const parsed = parseHeaderWithClang(header, options.clangPath === undefined ? {} : { clangPath: options.clangPath })
  const errors = parsed.diagnostics.filter(item => item.level === 'error')
  if (errors.length > 0) throw new Error(errors.map(item => item.message).join('\n'))

  return generateLibraryModule({
    name: entry.name,
    platform: entry.platform ?? 'portable',
    header,
    libraryNames: entry.libraryNames,
    ...(entry.env !== undefined && { env: entry.env }),
    declarations: parsed.declarations,
  }, { importPrefix: 'unffi' })
}

export const unplugin = createUnplugin<UnffiPluginOptions>((options) => {
  const entries = new Map(options.entries.map(entry => [entry.name, entry]))

  return {
    name: 'unffi-bindings',
    resolveId(id) {
      return resolveVirtualBindingId(id)
    },
    load(id) {
      if (!id.startsWith(resolvedPrefix)) return null
      const name = id.slice(resolvedPrefix.length)
      const entry = entries.get(name)
      if (!entry) return null

      try {
        return generateBindingModule(entry, options)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (options.diagnostics === 'silent') return 'export {}'
        if (options.diagnostics === 'warn') {
          this.warn(message)
          return 'export {}'
        }
        throw error
      }
    },
  }
})

export const vite = unplugin.vite
export const rollup = unplugin.rollup
export const webpack = unplugin.webpack
export const rspack = unplugin.rspack
export const esbuild = unplugin.esbuild
export const bun = unplugin.bun
