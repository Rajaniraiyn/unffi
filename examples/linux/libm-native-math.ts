/**
 * Linux: call libm for native math functions.
 *
 * Run on Linux:
 *   bun examples/linux/libm-native-math.ts
 */
import { openLibm } from 'unffi/linux/libm'

if (process.platform !== 'linux') {
  console.log('This example uses Linux libm and only runs on Linux.')
  process.exit(0)
}

await using libm = await openLibm()

const angle = Math.PI / 3
console.log({
  cos: libm.symbols.cos(angle),
  sin: libm.symbols.sin(angle),
  sqrt: libm.symbols.sqrt(81),
  fabs: libm.symbols.fabs(-123.456),
})
