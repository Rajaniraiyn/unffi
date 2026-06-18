import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { dlopen, t } from '../src/adapters/napi.js'

const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
const PLATFORM = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux'
const BCRYPT = `node_modules/bcrypt/prebuilds/${PLATFORM}-${ARCH}/bcrypt.node`

function openNapi() {
  return dlopen(BCRYPT, {
    gen_salt_sync: { args: [t.cstring, t.i32, t.buffer], returns: t.cstring },
    encrypt_sync:  { args: [t.cstring, t.cstring], returns: t.cstring },
    compare_sync:  { args: [t.cstring, t.cstring], returns: t.bool },
    get_rounds:    { args: [t.cstring], returns: t.i32 },
  })
}

let lib: ReturnType<typeof openNapi>

beforeAll(() => { lib = openNapi() })
afterAll(()  => lib.close())

describe('napi adapter loads bcrypt', () => {
  test('gen_salt_sync produces a salt string', () => {
    const seed = new Uint8Array(16)
    crypto.getRandomValues(seed)
    const salt = lib.symbols.gen_salt_sync('b', 10, seed)
    expect(salt).toBeString()
    expect(salt.startsWith('$2b$')).toBe(true)
    expect(salt.length).toBe(29)
  })

  test('encrypt_sync produces a hash', () => {
    const seed = new Uint8Array(16)
    crypto.getRandomValues(seed)
    const salt = lib.symbols.gen_salt_sync('b', 10, seed)
    const hash = lib.symbols.encrypt_sync('hunter2', salt)
    expect(hash).toBeString()
    expect(hash.startsWith('$2b$')).toBe(true)
    expect(hash.length).toBe(60)
  })

  test('compare_sync matches correct password', () => {
    const seed = new Uint8Array(16)
    crypto.getRandomValues(seed)
    const salt = lib.symbols.gen_salt_sync('b', 10, seed)
    const hash = lib.symbols.encrypt_sync('hunter2', salt)
    expect(lib.symbols.compare_sync('hunter2', hash)).toBe(true)
  })

  test('compare_sync rejects wrong password', () => {
    const seed = new Uint8Array(16)
    crypto.getRandomValues(seed)
    const salt = lib.symbols.gen_salt_sync('b', 10, seed)
    const hash = lib.symbols.encrypt_sync('hunter2', salt)
    expect(lib.symbols.compare_sync('wrong', hash)).toBe(false)
  })

  test('get_rounds returns round count', () => {
    const seed = new Uint8Array(16)
    crypto.getRandomValues(seed)
    const salt = lib.symbols.gen_salt_sync('b', 8, seed)
    const hash = lib.symbols.encrypt_sync('hunter2', salt)
    expect(lib.symbols.get_rounds(hash)).toBe(8)
  })
})
