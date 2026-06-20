import type { CTypeKind } from '../types.js'

export type BindingLanguage = 'c' | 'c++'
export type BindingPlatform = 'linux' | 'macos' | 'windows' | 'portable'

export interface HeaderSource {
  readonly path: string
  readonly language: BindingLanguage
  readonly includeDirs?: readonly string[]
  readonly defines?: Readonly<Record<string, string | number | true>>
}

export interface AbiType {
  readonly source: string
  readonly kind: CTypeKind | 'alias' | 'opaque'
  readonly tsType: string
  readonly tExpression: string
  readonly pointerDepth?: number
  readonly alias?: string
}

export interface FunctionBinding {
  readonly kind: 'function'
  readonly name: string
  readonly symbol: string
  readonly returns: AbiType
  readonly args: readonly AbiParameter[]
  readonly source?: string
  readonly unavailableReason?: string
}

export interface AbiParameter {
  readonly name: string
  readonly type: AbiType
}

export interface TypeAliasBinding {
  readonly kind: 'typeAlias'
  readonly name: string
  readonly type: AbiType
  readonly source?: string
}

export interface ConstantBinding {
  readonly kind: 'constant'
  readonly name: string
  readonly value: string | number | bigint | boolean
  readonly source?: string
}

export type BindingDeclaration = FunctionBinding | TypeAliasBinding | ConstantBinding

export interface LibraryBinding {
  readonly name: string
  readonly platform: BindingPlatform
  readonly header: HeaderSource
  readonly libraryNames: readonly string[]
  readonly env?: string
  readonly declarations: readonly BindingDeclaration[]
}

export interface BindingDiagnostic {
  readonly level: 'info' | 'warning' | 'error'
  readonly message: string
  readonly symbol?: string
  readonly source?: string
}

export interface ParsedHeader {
  readonly source: HeaderSource
  readonly declarations: readonly BindingDeclaration[]
  readonly diagnostics: readonly BindingDiagnostic[]
}
