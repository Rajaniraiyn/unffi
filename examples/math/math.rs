// math.rs — Rust math utility library, ABI-compatible with math.c
//
// Compile on macOS:
//   rustc --crate-type=cdylib -o libmath.dylib math.rs
//
// Compile on Linux:
//   rustc --crate-type=cdylib -o libmath.so math.rs
//
// Or add to Cargo.toml:
//   [lib]
//   crate-type = ["cdylib"]
//
// Notes on Rust float constants used below:
//   f32::NAN, f64::NAN       — quiet NaN (payload unspecified)
//   f32::INFINITY, f64::INFINITY — positive infinity
//   f32::NEG_INFINITY, f64::NEG_INFINITY — negative infinity
//   f32::MAX, f64::MAX       — largest finite representable value
//   These are all available as associated constants in stable Rust.

// ── Integer utilities ──────────────────────────────────────────────────────────

/// Clamp val into the inclusive range [min_val, max_val].
#[no_mangle]
pub extern "C" fn clamp_i32(val: i32, min_val: i32, max_val: i32) -> i32 {
    val.clamp(min_val, max_val)
}

/// Absolute value of a 64-bit signed integer.
/// i64::MIN returns i64::MAX (mirrors the C behaviour — no panic across FFI).
#[no_mangle]
pub extern "C" fn abs_i64(x: i64) -> i64 {
    if x == i64::MIN {
        i64::MAX
    } else {
        x.abs()
    }
}

/// Smaller of two unsigned 32-bit integers.
#[no_mangle]
pub extern "C" fn min_u32(a: u32, b: u32) -> u32 {
    a.min(b)
}

/// Larger of two unsigned 32-bit integers.
#[no_mangle]
pub extern "C" fn max_u32(a: u32, b: u32) -> u32 {
    a.max(b)
}

/// Saturating addition: clamps to i32::MAX on overflow, i32::MIN on underflow.
#[no_mangle]
pub extern "C" fn saturating_add_i32(a: i32, b: i32) -> i32 {
    a.saturating_add(b)
}

/// Wrapping (modular) addition — well-defined unsigned overflow.
#[no_mangle]
pub extern "C" fn wrapping_add_u32(a: u32, b: u32) -> u32 {
    a.wrapping_add(b)
}

// ── Floating-point utilities ───────────────────────────────────────────────────

/// Linear interpolation between a and b by factor t.
/// lerp(a, b, 0.0) == a, lerp(a, b, 1.0) == b.
#[no_mangle]
pub extern "C" fn lerp_f64(a: f64, b: f64, factor: f64) -> f64 {
    // Use the two-argument form to match the C implementation exactly.
    a + factor * (b - a)
}

/// Clamp a double to [lo, hi]. Propagates NaN unchanged.
#[no_mangle]
pub extern "C" fn clamp_f64(val: f64, lo: f64, hi: f64) -> f64 {
    if val.is_nan() {
        return val;
    }
    val.clamp(lo, hi)
}

/// Remap val from [in_lo, in_hi] into [out_lo, out_hi].
#[no_mangle]
pub extern "C" fn remap_f64(val: f64, in_lo: f64, in_hi: f64, out_lo: f64, out_hi: f64) -> f64 {
    let t = (val - in_lo) / (in_hi - in_lo);
    out_lo + t * (out_hi - out_lo)
}

/// Returns 1 if x is NaN, 0 otherwise.
#[no_mangle]
pub extern "C" fn is_nan_f64(x: f64) -> i32 {
    x.is_nan() as i32
}

/// Returns 1 if x is finite (not ±Inf and not NaN), 0 otherwise.
#[no_mangle]
pub extern "C" fn is_finite_f64(x: f64) -> i32 {
    x.is_finite() as i32
}

/// Compute base raised to the power exp using integer exponentiation.
/// exp must be >= 0; returns 0.0 for negative exponents (sentinel, not NaN).
#[no_mangle]
pub extern "C" fn ipow_f64(base: f64, exp: i32) -> f64 {
    if exp < 0 {
        return 0.0;
    }
    let mut result = 1.0f64;
    let mut b = base;
    let mut e = exp as u32;
    while e > 0 {
        if e & 1 == 1 {
            result *= b;
        }
        b *= b;
        e >>= 1;
    }
    result
}

// ── Single-precision ───────────────────────────────────────────────────────────

/// Clamp a float to [lo, hi]. Propagates NaN unchanged.
#[no_mangle]
pub extern "C" fn clamp_f32(val: f32, lo: f32, hi: f32) -> f32 {
    if val.is_nan() {
        return val;
    }
    val.clamp(lo, hi)
}

/// Normalise val into [0.0, 1.0] from [lo, hi].
#[no_mangle]
pub extern "C" fn normalize_f32(val: f32, lo: f32, hi: f32) -> f32 {
    (val - lo) / (hi - lo)
}

// ── Boolean query ──────────────────────────────────────────────────────────────

/// Returns 1 (true) if n is a power of two, 0 otherwise.
/// n <= 0 always returns 0.
#[no_mangle]
pub extern "C" fn is_pow2_i32(n: i32) -> i32 {
    (n > 0 && n.count_ones() == 1) as i32
}
