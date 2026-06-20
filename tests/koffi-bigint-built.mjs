import assert from 'node:assert/strict'

import { dlopen, t } from '../dist/adapters/koffi.js'

const lib = dlopen('/tmp/unffi_math', {
  add_u64: { args: [t.u64, t.u64], returns: t.u64 },
  add_i64: { args: [t.i64, t.i64], returns: t.i64, async: true },
})

try {
  const u64 = lib.symbols.add_u64(1n, 2n)
  assert.equal(typeof u64, 'bigint')
  assert.equal(u64, 3n)

  const i64 = await lib.symbols.add_i64(3n, 4n)
  assert.equal(typeof i64, 'bigint')
  assert.equal(i64, 7n)
} finally {
  lib.close()
}
