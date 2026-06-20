/**
 * Linux: inspect libdl binding metadata.
 *
 * `dlerror()` is normally useful after manual `dlopen` / `dlsym` calls. This
 * example shows the typed binding surface without forcing an artificial loader
 * failure.
 *
 * Run on Linux:
 *   bun examples/linux/libdl-metadata.ts
 */
import { libdlLibraryPaths, libdlSchema } from 'unffi/linux/libdl'

if (process.platform !== 'linux') {
  console.log('This example uses Linux libdl and only runs on Linux.')
  process.exit(0)
}

console.log({
  library: libdlLibraryPaths.candidates[0],
  symbol: 'dlerror',
  returns: libdlSchema.dlerror.returns.kind,
})
