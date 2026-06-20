/**
 * macOS: call CoreFoundation without Objective-C or Swift.
 *
 * Run on macOS:
 *   bun examples/macos/corefoundation-clock.ts
 */
import { openCoreFoundation } from 'unffi/macos/CoreFoundation'

if (process.platform !== 'darwin') {
  console.log('This example uses CoreFoundation and only runs on macOS.')
  process.exit(0)
}

await using coreFoundation = await openCoreFoundation()

const absoluteTime = coreFoundation.symbols.CFAbsoluteTimeGetCurrent()
const cfStringType = coreFoundation.symbols.CFStringGetTypeID()

console.log({
  absoluteTimeSecondsSince2001: absoluteTime,
  cfStringType,
})
