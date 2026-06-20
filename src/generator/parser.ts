import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import type {
  AbiParameter,
  BindingDeclaration,
  BindingDiagnostic,
  HeaderSource,
  ParsedHeader,
} from './ir.js'
import { isSupportedCType, mapCType } from './types.js'

export interface ParseHeaderOptions {
  readonly clangPath?: string
}

interface ClangNode {
  readonly kind?: string
  readonly name?: string
  readonly loc?: { readonly file?: string; readonly line?: number }
  readonly type?: { readonly qualType?: string }
  readonly inner?: readonly ClangNode[]
}

export function parseHeaderWithClang(source: HeaderSource, options: ParseHeaderOptions = {}): ParsedHeader {
  const clang = options.clangPath ?? 'clang'
  const args = [
    '-x',
    source.language === 'c++' ? 'c++' : 'c',
    '-Xclang',
    '-ast-dump=json',
    '-fsyntax-only',
    ...formatDefines(source.defines),
    ...(source.includeDirs ?? []).flatMap(dir => ['-I', dir]),
    source.path,
  ]

  const result = spawnSync(clang, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    return {
      source,
      declarations: [],
      diagnostics: [{
        level: 'error',
        message: result.stderr.trim() || `${clang} exited with status ${result.status}`,
        source: source.path,
      }],
    }
  }

  try {
    const ast = JSON.parse(result.stdout) as ClangNode
    return parseClangAst(source, ast)
  } catch (error) {
    return {
      source,
      declarations: [],
      diagnostics: [{
        level: 'error',
        message: `Failed to parse clang JSON AST: ${error instanceof Error ? error.message : String(error)}`,
        source: source.path,
      }],
    }
  }
}

export function parseClangAst(source: HeaderSource, ast: ClangNode): ParsedHeader {
  const declarations: BindingDeclaration[] = []
  const diagnostics: BindingDiagnostic[] = []
  const sourcePath = resolve(source.path)

  walk(ast, (node) => {
    if (!isFromSource(node, sourcePath)) return

    if (node.kind === 'FunctionDecl' && node.name && node.type?.qualType) {
      const parsed = parseFunctionType(node.type.qualType)
      if (!parsed) {
        diagnostics.push({ level: 'warning', message: `Unsupported function type: ${node.type.qualType}`, symbol: node.name })
        return
      }

      const returns = mapCType(parsed.returns)
      const args = parsed.args.map((arg, index): AbiParameter => ({
        name: `arg${index}`,
        type: mapCType(arg),
      }))
      const unsupported = [returns, ...args.map(arg => arg.type)].find(type => !isSupportedCType(type))
      if (unsupported) {
        diagnostics.push({
          level: 'warning',
          message: `Skipped ${node.name}: unsupported type ${unsupported.source}`,
          symbol: node.name,
        })
        return
      }

      declarations.push({
        kind: 'function',
        name: node.name,
        symbol: node.name,
        returns,
        args,
        source: source.path,
      })
      return
    }

    if (node.kind === 'TypedefDecl' && node.name && node.type?.qualType) {
      declarations.push({
        kind: 'typeAlias',
        name: node.name,
        type: mapCType(stripTypedefName(node.type.qualType, node.name)),
        source: source.path,
      })
    }
  })

  return { source, declarations, diagnostics }
}

function walk(node: ClangNode, visit: (node: ClangNode) => void) {
  visit(node)
  for (const child of node.inner ?? []) walk(child, visit)
}

function isFromSource(node: ClangNode, sourcePath: string): boolean {
  if (node.loc?.line !== undefined && node.loc.file === undefined) return true
  if (!node.loc?.file) return false
  return resolve(node.loc.file) === sourcePath
}

function parseFunctionType(type: string): { returns: string; args: readonly string[] } | null {
  const match = /^(?<returns>.+?)\s*\((?<args>.*)\)$/.exec(type)
  if (!match?.groups) return null
  const returns = match.groups.returns
  const rawArgs = match.groups.args
  if (returns === undefined || rawArgs === undefined) return null
  const args = rawArgs.trim()
  return {
    returns: returns.trim(),
    args: args === '' || args === 'void'
      ? []
      : splitArgs(args),
  }
}

function splitArgs(args: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0
  for (const char of args) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      result.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) result.push(current.trim())
  return result
}

function stripTypedefName(type: string, name: string): string {
  return type.endsWith(name)
    ? type.slice(0, -name.length).trim()
    : type
}

function formatDefines(defines: HeaderSource['defines']): string[] {
  if (!defines) return []
  return Object.entries(defines).map(([key, value]) => {
    if (value === true) return `-D${key}`
    return `-D${key}=${value}`
  })
}
