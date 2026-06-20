/**
 * Windows: call kernel32 for native process/thread/timing APIs.
 *
 * Run on Windows:
 *   bun examples/windows/kernel32-process.ts
 */
import { openKernel32 } from 'unffi/windows/kernel32'

if (process.platform !== 'win32') {
  console.log('This example uses kernel32.dll and only runs on Windows.')
  process.exit(0)
}

await using kernel32 = await openKernel32()

console.log({
  processId: kernel32.symbols.GetCurrentProcessId(),
  threadId: kernel32.symbols.GetCurrentThreadId(),
  uptimeMs: kernel32.symbols.GetTickCount64(),
  nativeStringLength: kernel32.symbols.lstrlenA('native-unffi'),
})
