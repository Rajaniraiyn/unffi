import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseHeaderWithClang } from '../../src/generator/parser.js'

const clang = spawnSync('clang', ['--version'], { encoding: 'utf8' })
const run = clang.status === 0 ? test : test.skip

describe('clang header parser', () => {
  run('parses C function declarations from a header', () => {
    const path = resolve('tests/fixtures/headers/basic.h')
    expect(existsSync(path)).toBe(true)

    const parsed = parseHeaderWithClang({ path, language: 'c' })
    expect(parsed.diagnostics.filter(item => item.level === 'error')).toEqual([])

    const functions = parsed.declarations.filter(item => item.kind === 'function')
    expect(functions.map(fn => fn.name)).toEqual(['getpid', 'strlen', 'strcmp', 'dlopen'])
    expect(functions.find(fn => fn.name === 'strlen')?.returns.tExpression).toBe('t.u64')
    expect(functions.find(fn => fn.name === 'strlen')?.args[0]?.type.tExpression).toBe('t.cstring')
    expect(functions.find(fn => fn.name === 'dlopen')?.returns.tExpression).toBe('t.pointer')
  })

  run('parses C++ extern C declarations from a header', () => {
    const path = resolve('tests/fixtures/headers/basic.hpp')
    const parsed = parseHeaderWithClang({ path, language: 'c++' })
    expect(parsed.diagnostics.filter(item => item.level === 'error')).toEqual([])

    const functions = parsed.declarations.filter(item => item.kind === 'function')
    expect(functions.map(fn => fn.name)).toEqual(['GetCurrentThreadId', 'lstrlenA'])
    expect(functions.find(fn => fn.name === 'GetCurrentThreadId')?.returns.tExpression).toBe('t.u32')
    expect(functions.find(fn => fn.name === 'lstrlenA')?.args[0]?.type.tExpression).toBe('t.cstring')
  })
})
