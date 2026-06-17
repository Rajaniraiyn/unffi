import { defineConfig } from 'vitest/config'

// UNFFI_RUNTIME is set by the test scripts so each runtime runs only its tests.
// Falls back to 'bun' if unset (primary dev runtime).
const runtime = (process.env.UNFFI_RUNTIME ?? 'bun') as 'bun' | 'deno' | 'node'

const include = [
  runtime === 'bun'  ? 'tests/bun/**/*.test.ts'  : null,
  runtime === 'deno' ? 'tests/deno/**/*.test.ts' : null,
  runtime === 'node' ? 'tests/node/**/*.test.ts' : null,
  'tests/shared/**/*.test.ts',
].filter(Boolean) as string[]

export default defineConfig({
  test: {
    include,
    // Tests compile and load native dylibs — run sequentially to avoid
    // parallel cc invocations clobbering the same /tmp paths
    singleThread: true,
  },
})
