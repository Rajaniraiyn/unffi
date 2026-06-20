import { describe, expect, test } from 'bun:test'
import { mapCType } from '../../src/generator/types.js'

describe('generator type mapper', () => {
  test('maps common C ABI aliases', () => {
    expect(mapCType('size_t').tExpression).toBe('t.u64')
    expect(mapCType('ssize_t').tExpression).toBe('t.i64')
    expect(mapCType('pid_t').tExpression).toBe('t.i32')
    expect(mapCType('uintptr_t').tsType).toBe('bigint')
  })

  test('maps Darwin and Win32 common aliases', () => {
    expect(mapCType('CFTypeID').tExpression).toBe('t.u64')
    expect(mapCType('CFIndex').tExpression).toBe('t.i64')
    expect(mapCType('DWORD').tExpression).toBe('t.u32')
    expect(mapCType('BOOL').tExpression).toBe('t.i32')
    expect(mapCType('HANDLE').tExpression).toBe('t.pointer')
  })

  test('maps char pointers to cstring and other pointers to pointer', () => {
    expect(mapCType('const char *').tExpression).toBe('t.cstring')
    expect(mapCType('char *').tExpression).toBe('t.cstring')
    expect(mapCType('void *').tExpression).toBe('t.pointer')
    expect(mapCType('struct CFString *').tExpression).toBe('t.pointer')
  })
})
