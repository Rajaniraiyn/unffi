/**
 * Windows: call user32 for desktop metrics that are native Win32 concepts.
 *
 * Run on Windows:
 *   bun examples/windows/user32-system-metrics.ts
 */
import { openUser32 } from 'unffi/windows/user32'

if (process.platform !== 'win32') {
  console.log('This example uses user32.dll and only runs on Windows.')
  process.exit(0)
}

const SM_CXSCREEN = 0
const SM_CYSCREEN = 1

await using user32 = await openUser32()

console.log({
  screenWidth: user32.symbols.GetSystemMetrics(SM_CXSCREEN),
  screenHeight: user32.symbols.GetSystemMetrics(SM_CYSCREEN),
  doubleClickTimeMs: user32.symbols.GetDoubleClickTime(),
})
