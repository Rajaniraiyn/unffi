/**
 * macOS: call libSystem directly for process and C string APIs.
 *
 * Run on macOS:
 *   bun examples/macos/libsystem-process.ts
 */
import { openLibSystem } from 'unffi/macos/libSystem'

if (process.platform !== 'darwin') {
  console.log('This example uses macOS libSystem and only runs on macOS.')
  process.exit(0)
}

await using libSystem = await openLibSystem()

const pid = libSystem.symbols.getpid()
const nativeLength = libSystem.symbols.strlen('native-unffi')
const order = libSystem.symbols.strcmp('apple', 'banana')
const answer = libSystem.symbols.atoi('42')

console.log({ pid, nativeLength, order, answer })
