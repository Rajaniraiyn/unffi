/**
 * callbacks.ts — unffi callback patterns
 *
 * Demonstrates every callback shape exposed by callbacks.c / callbacks.rs:
 *   • for_each   — void callback receiving (index, value)
 *   • map_i32    — transform callback returning a new value
 *   • filter_count — predicate callback returning bool (as number)
 *   • register_handler / fire_event — event-emitter with cstring payload
 *
 * Build the native library first:
 *
 *   # C / macOS
 *   cc -shared -fPIC -o libcallbacks.dylib examples/callbacks/callbacks.c
 *
 *   # C / Linux
 *   cc -shared -fPIC -o libcallbacks.so examples/callbacks/callbacks.c
 *
 *   # Rust / macOS
 *   rustc --crate-type=cdylib -o libcallbacks.dylib examples/callbacks/callbacks.rs
 *
 *   # Rust / Linux
 *   rustc --crate-type=cdylib -o libcallbacks.so examples/callbacks/callbacks.rs
 *
 * Run:
 *   bun    examples/callbacks/callbacks.ts
 *   deno run --allow-ffi examples/callbacks/callbacks.ts
 *   node  --experimental-vm-modules examples/callbacks/callbacks.ts
 */

import { dlopen, t } from 'unffi'

// ── Schema ────────────────────────────────────────────────────────────────────
// Each t.fn(argTypes, returnType) tells unffi:
//   • which C ABI the callback must conform to
//   • what TypeScript type to infer for the JS function the caller provides
//
// TypeScript will reject a callback with the wrong signature at compile time.
// For example, passing (x: string) => void where (index: number, value: number)
// => void is expected is a type error — no cast required.

const schema = {
  // void for_each(const int32_t *arr, int32_t len,
  //               void (*fn)(int32_t index, int32_t value))
  for_each: {
    args: [
      t.buffer,                              // arr  — Int32Array passed as raw pointer
      t.i32,                                 // len
      t.fn([t.i32, t.i32], t.void),          // fn(index, value) -> void
    ],
    returns: t.void,
  },

  // void map_i32(const int32_t *src, int32_t *dst, int32_t len,
  //              int32_t (*fn)(int32_t value))
  map_i32: {
    args: [
      t.buffer,                              // src
      t.buffer,                              // dst — writable Int32Array
      t.i32,                                 // len
      t.fn([t.i32], t.i32),                  // fn(value) -> int32_t
    ],
    returns: t.void,
  },

  // int32_t filter_count(const int32_t *arr, int32_t len,
  //                      int32_t (*fn)(int32_t value))
  // fn returns non-zero to keep the element, zero to discard.
  // We type-annotate the return as t.i32 (not t.bool) to match C convention.
  filter_count: {
    args: [
      t.buffer,                              // arr
      t.i32,                                 // len
      t.fn([t.i32], t.i32),                  // predicate(value) -> int (0 or 1)
    ],
    returns: t.i32,
  },

  // void register_handler(void (*on_event)(int32_t type, const char *data))
  register_handler: {
    args: [t.fn([t.i32, t.cstring], t.void)],
    returns: t.void,
  },

  // void fire_event(int32_t type, const char *data)
  fire_event: {
    args: [t.i32, t.cstring],
    returns: t.void,
  },
} as const

// ── Open the library ──────────────────────────────────────────────────────────
// `await using` gives automatic cleanup via Symbol.asyncDispose.
// When the block exits (normally or via exception) unffi will:
//   1. call .close() on every registered JSCallback / UnsafeCallback
//   2. close the native library handle
// No explicit try/finally needed.

await using lib = await dlopen('./libcallbacks', schema)
const { symbols } = lib

// ── for_each: collect (index, value) pairs ────────────────────────────────────
console.log('── for_each ──')

const input = new Int32Array([10, 20, 30, 40, 50])

// TypeScript infers the callback as (index: number, value: number) => void.
// Passing the wrong type — e.g. (x: string) => void — is a compile error.
const pairs: Array<[number, number]> = []

symbols.for_each(input, input.length, (index, value) => {
  pairs.push([index, value])
})

console.log('pairs:', pairs)
// Expected: [ [0,10], [1,20], [2,30], [3,40], [4,50] ]

// Closures over external state work as expected — the JS engine owns the
// closed-over variable; unffi only ferries the call from C back to JS.
let callCount = 0
symbols.for_each(input, input.length, (_index, _value) => {
  callCount++
})
console.log('callCount:', callCount)   // 5

// ── map_i32: double every element ─────────────────────────────────────────────
console.log('\n── map_i32 ──')

const src = new Int32Array([1, 2, 3, 4, 5])
const dst = new Int32Array(src.length)

// The callback is inferred as (value: number) => number.
symbols.map_i32(src, dst, src.length, (value) => value * 2)

console.log('src:', Array.from(src))   // [1, 2, 3, 4, 5]
console.log('dst:', Array.from(dst))   // [2, 4, 6, 8, 10]

// map_i32 with a more interesting transform: square root rounded down
const roots = new Int32Array(src.length)
symbols.map_i32(src, roots, src.length, (value) => Math.floor(Math.sqrt(value)))
console.log('roots:', Array.from(roots))  // [1, 1, 1, 2, 2]

// ── filter_count: count even numbers ──────────────────────────────────────────
console.log('\n── filter_count ──')

const numbers = new Int32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

// The predicate is inferred as (value: number) => number.
// Return 1 to keep, 0 to discard — matches C's int-as-bool convention.
const evenCount = symbols.filter_count(
  numbers,
  numbers.length,
  (value) => (value % 2 === 0 ? 1 : 0),
)
console.log('evenCount:', evenCount)   // 5

const positiveCount = symbols.filter_count(
  new Int32Array([-3, -1, 0, 2, 5, 8]),
  6,
  (value) => (value > 0 ? 1 : 0),
)
console.log('positiveCount:', positiveCount)  // 3

// ── Event emitter ─────────────────────────────────────────────────────────────
console.log('\n── event emitter ──')

// Event type constants — match the values documented in callbacks.c / callbacks.rs
const EVENT = { CONNECTED: 0, DATA: 1, DISCONNECTED: 2 } as const

// Accumulate events for inspection
const receivedEvents: Array<{ type: number; data: string }> = []

// The callback is inferred as (type: number, data: string) => void.
// unffi maps t.cstring → string for input parameters automatically.
symbols.register_handler((type, data) => {
  receivedEvents.push({ type, data })
})

symbols.fire_event(EVENT.CONNECTED, 'client=192.168.1.5')
symbols.fire_event(EVENT.DATA,      'payload={"temp":22.4}')
symbols.fire_event(EVENT.DATA,      'payload={"temp":23.1}')
symbols.fire_event(EVENT.DISCONNECTED, 'client=192.168.1.5')

console.log('received events:')
for (const ev of receivedEvents) {
  const name = Object.entries(EVENT).find(([, v]) => v === ev.type)?.[0] ?? ev.type
  console.log(`  ${name}: ${ev.data}`)
}
// Expected:
//   CONNECTED: client=192.168.1.5
//   DATA: payload={"temp":22.4}
//   DATA: payload={"temp":23.1}
//   DISCONNECTED: client=192.168.1.5

// Unregister by overwriting the handler slot.
// The old JSCallback / UnsafeCallback remains valid until lib.close() is called.
// C's fire_event will now be a no-op.
symbols.register_handler(() => {
  // silence after this point — only here to demonstrate re-registration
})
symbols.fire_event(EVENT.DATA, 'this should not appear')
console.log('total events received:', receivedEvents.length)  // still 4

// lib.close() is called automatically by `await using` here.
// All callbacks are torn down in a single pass.
