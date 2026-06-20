/**
 * Linux: inspect the native pthread id for the current JS thread.
 *
 * Run on Linux:
 *   bun examples/linux/pthread-self.ts
 */
import { openPthread } from 'unffi/linux/pthread'

if (process.platform !== 'linux') {
  console.log('This example uses pthread and only runs on Linux.')
  process.exit(0)
}

await using pthread = await openPthread()

const self = pthread.symbols.pthread_self()
const equalsSelf = pthread.symbols.pthread_equal(self, self) === 1

console.log({ pthread: self, equalsSelf })
