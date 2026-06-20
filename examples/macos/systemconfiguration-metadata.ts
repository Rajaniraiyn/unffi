/**
 * macOS: inspect a SystemConfiguration binding safely.
 *
 * `SCDynamicStoreCopyProxies` returns a CoreFoundation object pointer. The
 * current binding exposes the symbol and type, but this example avoids
 * ownership-heavy pointer work until higher-level CF object wrappers land.
 *
 * Run on macOS:
 *   bun examples/macos/systemconfiguration-metadata.ts
 */
import {
  systemConfigurationLibraryPaths,
  systemConfigurationSchema,
} from 'unffi/macos/SystemConfiguration'

if (process.platform !== 'darwin') {
  console.log('This example uses SystemConfiguration and only runs on macOS.')
  process.exit(0)
}

console.log({
  library: systemConfigurationLibraryPaths.candidates[0],
  symbol: 'SCDynamicStoreCopyProxies',
  returns: systemConfigurationSchema.SCDynamicStoreCopyProxies.returns.kind,
})
