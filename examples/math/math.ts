/**
 * math.ts — unffi numeric type tour
 *
 * Demonstrates every numeric primitive in the t namespace:
 *   t.i32, t.i64, t.u32, t.u64, t.f32, t.f64, t.bool
 *
 * Also shows:
 *   • BigInt for i64 / u64 parameters and return values
 *   • async: true for a computationally-bound function (runs on a thread pool)
 *   • await using for automatic library teardown
 *
 * Build the native library first:
 *
 *   # C / macOS
 *   cc -shared -fPIC -o libmath.dylib examples/math/math.c -lm
 *
 *   # C / Linux
 *   cc -shared -fPIC -o libmath.so examples/math/math.c -lm
 *
 *   # Rust / macOS
 *   rustc --crate-type=cdylib -o libmath.dylib examples/math/math.rs
 *
 *   # Rust / Linux
 *   rustc --crate-type=cdylib -o libmath.so examples/math/math.rs
 *
 * Run:
 *   bun    examples/math/math.ts
 *   deno run --allow-ffi examples/math/math.ts
 *   node  --experimental-vm-modules examples/math/math.ts
 */

import { dlopen, t } from 'unffi'

// ── Schema ────────────────────────────────────────────────────────────────────
// Every numeric CTypeKind is represented.
// Note that t.i64 / t.u64 map to BigInt in TypeScript — pass and receive BigInt
// literals (e.g. 1n, -9007199254740993n) when calling those symbols.

const schema = {
  // ── integer utilities ──────────────────────────────────────────────────────

  // int32_t clamp_i32(int32_t val, int32_t min_val, int32_t max_val)
  clamp_i32:           { args: [t.i32, t.i32, t.i32],  returns: t.i32 },

  // int64_t abs_i64(int64_t x)
  // i64 parameters and return value are bigint in TypeScript.
  abs_i64:             { args: [t.i64],                 returns: t.i64 },

  // uint32_t min_u32(uint32_t a, uint32_t b)
  min_u32:             { args: [t.u32, t.u32],          returns: t.u32 },

  // uint32_t max_u32(uint32_t a, uint32_t b)
  max_u32:             { args: [t.u32, t.u32],          returns: t.u32 },

  // int32_t saturating_add_i32(int32_t a, int32_t b)
  saturating_add_i32:  { args: [t.i32, t.i32],          returns: t.i32 },

  // uint32_t wrapping_add_u32(uint32_t a, uint32_t b)
  wrapping_add_u32:    { args: [t.u32, t.u32],          returns: t.u32 },

  // ── floating-point utilities ───────────────────────────────────────────────

  // double lerp_f64(double a, double b, double factor)
  lerp_f64:            { args: [t.f64, t.f64, t.f64],  returns: t.f64 },

  // double clamp_f64(double val, double lo, double hi)
  clamp_f64:           { args: [t.f64, t.f64, t.f64],  returns: t.f64 },

  // double remap_f64(double val, double in_lo, double in_hi,
  //                  double out_lo, double out_hi)
  remap_f64:           { args: [t.f64, t.f64, t.f64, t.f64, t.f64], returns: t.f64 },

  // int32_t is_nan_f64(double x)   — returns 1 for NaN, 0 otherwise
  is_nan_f64:          { args: [t.f64],                 returns: t.i32 },

  // int32_t is_finite_f64(double x) — returns 1 for finite, 0 otherwise
  is_finite_f64:       { args: [t.f64],                 returns: t.i32 },

  // double ipow_f64(double base, int32_t exp)
  // Run on a background thread — useful when called in a tight loop from JS.
  ipow_f64:            { args: [t.f64, t.i32],          returns: t.f64, async: true },

  // ── single-precision ──────────────────────────────────────────────────────

  // float clamp_f32(float val, float lo, float hi)
  clamp_f32:           { args: [t.f32, t.f32, t.f32],  returns: t.f32 },

  // float normalize_f32(float val, float lo, float hi)
  normalize_f32:       { args: [t.f32, t.f32, t.f32],  returns: t.f32 },

  // ── boolean query ─────────────────────────────────────────────────────────

  // int32_t is_pow2_i32(int32_t n)  — returns 1 for power-of-two, 0 otherwise
  is_pow2_i32:         { args: [t.i32],                 returns: t.i32 },
} as const

// ── Open the library ──────────────────────────────────────────────────────────
await using lib = await dlopen('./libmath', schema)
const { symbols: m } = lib

// ── Integer arithmetic ────────────────────────────────────────────────────────
console.log('── integers ──')

console.log('clamp_i32(150, 0, 100)       =', m.clamp_i32(150, 0, 100))   // 100
console.log('clamp_i32(-5, 0, 100)        =', m.clamp_i32(-5, 0, 100))    // 0
console.log('clamp_i32(50, 0, 100)        =', m.clamp_i32(50, 0, 100))    // 50

// i64 / u64: pass BigInt literals; the return value is also BigInt.
// Numbers larger than Number.MAX_SAFE_INTEGER (2^53 - 1) require BigInt.
const bigNeg = -9_007_199_254_740_993n   // just beyond MAX_SAFE_INTEGER magnitude
console.log('abs_i64(-1n)                 =', m.abs_i64(-1n))             // 1n
console.log('abs_i64(bigNeg)              =', m.abs_i64(bigNeg))          // 9007199254740993n

console.log('min_u32(7, 3)                =', m.min_u32(7, 3))            // 3
console.log('max_u32(7, 3)                =', m.max_u32(7, 3))            // 7

// Saturating: no overflow, clamps instead
console.log('saturating_add_i32(MAX, 1)   =', m.saturating_add_i32(2_147_483_647, 1))  // 2147483647

// Wrapping: u32 wraps modulo 2^32
console.log('wrapping_add_u32(MAX_U32, 1) =', m.wrapping_add_u32(4_294_967_295, 1))    // 0

// ── Floating-point ────────────────────────────────────────────────────────────
console.log('\n── floats (f64) ──')

console.log('lerp_f64(0, 100, 0.25)       =', m.lerp_f64(0, 100, 0.25))  // 25
console.log('lerp_f64(0, 100, 0.75)       =', m.lerp_f64(0, 100, 0.75))  // 75
console.log('lerp_f64(10, 20, 0)          =', m.lerp_f64(10, 20, 0))     // 10
console.log('lerp_f64(10, 20, 1)          =', m.lerp_f64(10, 20, 1))     // 20

console.log('clamp_f64(5.5, 0, 4)         =', m.clamp_f64(5.5, 0, 4))   // 4
console.log('clamp_f64(NaN, 0, 1)         =', m.clamp_f64(NaN, 0, 1))   // NaN — propagated

// Remap a temperature from Celsius [0, 100] to a normalised [0, 1] value
const tempC = 37.0
const normalised = m.remap_f64(tempC, 0, 100, 0, 1)
console.log(`remap_f64(${tempC}, 0,100 → 0,1) =`, normalised.toFixed(4))  // 0.3700

// NaN / finite predicates — return i32 (1 or 0), not TypeScript boolean
console.log('is_nan_f64(NaN)              =', m.is_nan_f64(NaN))          // 1
console.log('is_nan_f64(1.5)              =', m.is_nan_f64(1.5))          // 0
console.log('is_finite_f64(Infinity)      =', m.is_finite_f64(Infinity))  // 0
console.log('is_finite_f64(-Infinity)     =', m.is_finite_f64(-Infinity)) // 0
console.log('is_finite_f64(42.0)          =', m.is_finite_f64(42.0))      // 1

// ── Async: run on a thread pool ───────────────────────────────────────────────
// ipow_f64 is marked async: true in the schema.
// The call immediately returns a Promise and the C function executes on a
// native thread (Bun: Bun.FFI nonblocking; Deno: nonblocking; koffi: async).
// This avoids blocking the JS event loop for CPU-bound C work.
console.log('\n── async (thread pool) ──')

const [pow2, pow3, pow10] = await Promise.all([
  m.ipow_f64(2, 10),   // 1024
  m.ipow_f64(3, 8),    // 6561
  m.ipow_f64(10, 6),   // 1000000
])
console.log('ipow_f64(2, 10)  =', pow2)   // 1024
console.log('ipow_f64(3, 8)   =', pow3)   // 6561
console.log('ipow_f64(10, 6)  =', pow10)  // 1000000

// ── Single-precision ──────────────────────────────────────────────────────────
console.log('\n── floats (f32) ──')

// f32 is still TypeScript number — the value is truncated to single precision
// inside the C / Rust function.
console.log('clamp_f32(1.5, 0, 1)         =', m.clamp_f32(1.5, 0, 1))   // 1
console.log('normalize_f32(75, 0, 100)    =', m.normalize_f32(75, 0, 100).toFixed(4))  // 0.7500

// ── Boolean query ─────────────────────────────────────────────────────────────
console.log('\n── boolean (returned as i32) ──')

const powersOf2 = [1, 2, 4, 8, 16, 32, 64, 128]
const notPowers = [0, 3, 5, 6, 7, 9, 100]

for (const n of powersOf2) {
  const result = m.is_pow2_i32(n)
  console.log(`is_pow2_i32(${n.toString().padStart(3)}) = ${result}  ${result === 1 ? '✓' : '✗'}`)
}
for (const n of notPowers) {
  const result = m.is_pow2_i32(n)
  console.log(`is_pow2_i32(${n.toString().padStart(3)}) = ${result}  ${result === 0 ? '✓' : '✗'}`)
}

// lib.close() is called automatically by `await using` here.
