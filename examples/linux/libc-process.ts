/**
 * Linux: call libc process and C string APIs directly.
 *
 * Run on Linux:
 *   bun examples/linux/libc-process.ts
 */
import { openLibc } from 'unffi/linux/libc'

if (process.platform !== 'linux') {
  console.log('This example uses glibc libc and only runs on Linux.')
  process.exit(0)
}

await using libc = await openLibc()

console.log({
  pid: libc.symbols.getpid(),
  parentPid: libc.symbols.getppid(),
  nativeLength: libc.symbols.strlen('native-unffi'),
  compare: libc.symbols.strcmp('alpha', 'beta'),
})
