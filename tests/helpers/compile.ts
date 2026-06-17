import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const fixturesDir = resolve(__dirname, '..', 'fixtures')

/**
 * Compile a C source file into a shared library (.dylib on macOS).
 */
export async function compileC(srcPath: string, outPath: string): Promise<void> {
  const proc = Bun.spawn(['cc', '-shared', '-fPIC', '-o', outPath, srcPath], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    throw new Error(
      `compileC failed (exit ${exitCode}):\nstdout: ${stdout}\nstderr: ${stderr}`,
    )
  }
}

/**
 * Compile a Rust source file into a cdylib (.dylib on macOS).
 */
export async function compileRust(srcPath: string, outPath: string): Promise<void> {
  const proc = Bun.spawn(
    ['rustc', '--crate-type=cdylib', '-o', outPath, srcPath],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    throw new Error(
      `compileRust failed (exit ${exitCode}):\nstdout: ${stdout}\nstderr: ${stderr}`,
    )
  }
}

/**
 * Resolve a path relative to tests/fixtures/.
 */
export function fixturePath(name: string): string {
  return resolve(fixturesDir, name)
}

/**
 * Resolve an output path in /tmp for a named test dylib.
 * Extension is .dylib (macOS / darwin).
 */
export function tmpLib(name: string): string {
  return `/tmp/unffi-test-${name}.dylib`
}
