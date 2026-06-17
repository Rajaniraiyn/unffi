/**
 * Example: call a C `add(int a, int b) -> int` function
 *
 * Compile the C lib first:
 *   echo 'int add(int a, int b) { return a + b; }' > add.c
 *   cc -shared -o libadd.so add.c     # Linux
 *   cc -shared -o libadd.dylib add.c  # macOS
 */
import { dlopen, t } from 'unffi'

const lib = await dlopen('./libadd', {
  add:      { args: [t.i32, t.i32], returns: t.i32 },
  addAsync: { args: [t.i32, t.i32], returns: t.i32, async: true },
})

console.log(lib.symbols.add(2, 3))              // 5
console.log(await lib.symbols.addAsync(10, 20)) // 30

lib.close()
