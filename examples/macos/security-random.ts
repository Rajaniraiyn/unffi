/**
 * macOS: fill bytes with Security.framework's SecRandomCopyBytes.
 *
 * Run on macOS:
 *   bun examples/macos/security-random.ts
 */
import { openSecurity } from 'unffi/macos/Security'

if (process.platform !== 'darwin') {
  console.log('This example uses Security.framework and only runs on macOS.')
  process.exit(0)
}

await using security = await openSecurity()

const bytes = new Uint8Array(32)
const status = security.symbols.SecRandomCopyBytes(null, BigInt(bytes.byteLength), bytes)
if (status !== 0) throw new Error(`SecRandomCopyBytes failed with OSStatus ${status}`)

console.log(Buffer.from(bytes).toString('hex'))
