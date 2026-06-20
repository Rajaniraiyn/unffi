import type { FunctionBinding, LibraryBinding } from './ir.js'

export interface CodegenOptions {
  readonly schemaName?: string
  readonly pathsName?: string
  readonly openName?: string
  readonly importPrefix?: string
}

export function generateLibraryModule(binding: LibraryBinding, options: CodegenOptions = {}): string {
  const schemaName = options.schemaName ?? `${lowerFirst(binding.name)}Schema`
  const pathsName = options.pathsName ?? `${lowerFirst(binding.name)}LibraryPaths`
  const openName = options.openName ?? `open${upperFirst(binding.name)}`
  const importPrefix = options.importPrefix ?? '.'
  const functions = binding.declarations.filter((item): item is FunctionBinding => item.kind === 'function')

  return [
    `import type { InferLibrary, SymbolsSchema } from '${importPrefix}/define.js'`,
    `import { dlopen } from '${importPrefix}/index.js'`,
    `import { resolveLibraryPathSync } from '${importPrefix}/paths.js'`,
    `import { t } from '${importPrefix}/types.js'`,
    '',
    `export const ${pathsName} = {`,
    `  env: ${JSON.stringify(binding.env ?? `UNFFI_${binding.name.toUpperCase()}_PATH`)},`,
    `  candidates: ${formatStringArray(binding.libraryNames)},`,
    `} as const`,
    '',
    `export const ${schemaName} = {`,
    ...functions.map(fn => `  ${quoteKey(fn.name)}: { args: [${fn.args.map(arg => arg.type.tExpression).join(', ')}], returns: ${fn.returns.tExpression} },`),
    `} as const satisfies SymbolsSchema`,
    '',
    `export async function ${openName}(pathOverride?: string): Promise<InferLibrary<typeof ${schemaName}>> {`,
    `  const path = pathOverride ?? resolveLibraryPathSync(${pathsName}.candidates[0]!)`,
    `  return dlopen(path, ${schemaName})`,
    `}`,
    '',
  ].join('\n')
}

function formatStringArray(values: readonly string[]): string {
  return `[${values.map(value => JSON.stringify(value)).join(', ')}]`
}

function quoteKey(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`
}

function upperFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`
}
