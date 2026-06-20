/**
 * Linux: call POSIX-style unistd APIs directly through libc.
 *
 * Run on Linux:
 *   bun examples/linux/unistd-access.ts
 */
import { openUnistd } from 'unffi/linux/unistd'

if (process.platform !== 'linux') {
  console.log('This example uses Linux unistd symbols and only runs on Linux.')
  process.exit(0)
}

await using unistd = await openUnistd()

console.log({
  uid: unistd.symbols.getuid(),
  gid: unistd.symbols.getgid(),
  parentPid: unistd.symbols.getppid(),
  rootExists: unistd.symbols.access('/', 0) === 0,
})
