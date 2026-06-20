/**
 * Windows: call advapi32's GetUserNameA with native output buffers.
 *
 * Run on Windows:
 *   bun examples/windows/advapi32-username.ts
 */
import { openAdvapi32 } from 'unffi/windows/advapi32'

if (process.platform !== 'win32') {
  console.log('This example uses advapi32.dll and only runs on Windows.')
  process.exit(0)
}

await using advapi32 = await openAdvapi32()

const name = new Uint8Array(257)
const size = new Uint32Array([name.byteLength])
const ok = advapi32.symbols.GetUserNameA(name, size)
if (ok === 0) throw new Error('GetUserNameA failed')

const bytes = name.subarray(0, Math.max(0, (size[0] ?? 1) - 1))
const username = new TextDecoder().decode(bytes)

console.log({ username })
