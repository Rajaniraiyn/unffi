import type { AbiType, BindingPlatform } from './ir.js'

export interface TypeMappingOptions {
  readonly platform?: BindingPlatform
  readonly aliases?: Readonly<Record<string, string>>
}

const builtinAliases: Record<string, string> = {
  bool: 'bool',
  _Bool: 'bool',
  char: 'i8',
  signed_char: 'i8',
  unsigned_char: 'u8',
  short: 'i16',
  signed_short: 'i16',
  unsigned_short: 'u16',
  int: 'i32',
  signed_int: 'i32',
  unsigned_int: 'u32',
  long: 'i64',
  signed_long: 'i64',
  unsigned_long: 'u64',
  long_long: 'i64',
  signed_long_long: 'i64',
  unsigned_long_long: 'u64',
  float: 'f32',
  double: 'f64',
  void: 'void',
  size_t: 'u64',
  ssize_t: 'i64',
  ptrdiff_t: 'i64',
  intptr_t: 'i64',
  uintptr_t: 'u64',
  pid_t: 'i32',
  uid_t: 'u32',
  gid_t: 'u32',
  time_t: 'i64',
  CFIndex: 'i64',
  CFTypeID: 'u64',
  DWORD: 'u32',
  BOOL: 'i32',
  BOOLEAN: 'u8',
  HRESULT: 'i32',
  UINT: 'u32',
  ULONG: 'u32',
  LONG: 'i32',
  LPCSTR: 'cstring',
  LPSTR: 'pointer',
  HANDLE: 'pointer',
  HMODULE: 'pointer',
  HWND: 'pointer',
}

const tsTypes: Record<string, string> = {
  void: 'void',
  bool: 'boolean',
  i8: 'number',
  i16: 'number',
  i32: 'number',
  i64: 'bigint',
  u8: 'number',
  u16: 'number',
  u32: 'number',
  u64: 'bigint',
  f32: 'number',
  f64: 'number',
  cstring: 'string',
  pointer: 'Ptr | null',
  buffer: 'ArrayBufferView',
  function: '(...args: unknown[]) => unknown',
}

export function mapCType(type: string, options: TypeMappingOptions = {}): AbiType {
  const normalized = normalizeCType(type)
  const aliasTable = { ...builtinAliases, ...options.aliases }

  if (normalized.endsWith('*')) {
    const pointerDepth = normalized.split('*').length - 1
    const base = normalized.replace(/\s*\*+\s*$/, '').trim()
    if (isCharPointer(base)) return abiType(type, 'cstring', 1)
    return {
      source: type,
      kind: 'pointer',
      tsType: tsTypes.pointer!,
      tExpression: 't.pointer',
      pointerDepth,
      alias: base,
    }
  }

  const key = normalizeAliasKey(normalized)
  const kind = aliasTable[key]
  if (kind !== undefined) return abiType(type, kind)

  return {
    source: type,
    kind: 'opaque',
    tsType: 'unknown',
    tExpression: 't.pointer',
    alias: normalized,
  }
}

export function isSupportedCType(type: AbiType): boolean {
  return type.kind !== 'opaque' && type.kind !== 'function'
}

function abiType(source: string, kind: string, pointerDepth?: number): AbiType {
  return {
    source,
    kind: kind as AbiType['kind'],
    tsType: tsTypes[kind] ?? 'unknown',
    tExpression: `t.${kind}`,
    ...(pointerDepth !== undefined && { pointerDepth }),
  }
}

function isCharPointer(base: string): boolean {
  const key = normalizeAliasKey(base)
  return key === 'char' || key === 'const_char'
}

export function normalizeCType(type: string): string {
  return type
    .replace(/\bconst\b/g, 'const')
    .replace(/\bvolatile\b/g, '')
    .replace(/\brestrict\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\*/g, '*')
    .replace(/\*\s+/g, '*')
    .trim()
}

function normalizeAliasKey(type: string): string {
  return type
    .replace(/\bconst\b/g, 'const')
    .replace(/\bstruct\s+/g, '')
    .replace(/\benum\s+/g, '')
    .replace(/\s+/g, '_')
    .replace(/\*/g, '_ptr')
    .replace(/^const_/, '')
}
