/**
 * math.c — C math utility library demonstrating all unffi primitive types
 *
 * Compile on macOS:
 *   cc -shared -fPIC -o libmath.dylib math.c
 *
 * Compile on Linux:
 *   cc -shared -fPIC -o libmath.so math.c
 *
 * Compile on Windows (MSVC):
 *   cl /LD math.c /Fe:math.dll
 */

#include <stdint.h>
#include <math.h>   /* isnan, isinf, isfinite — requires linking with -lm */

/* ── Integer utilities ────────────────────────────────────────────────────────*/

/** Clamp val into the inclusive range [min_val, max_val]. */
int32_t clamp_i32(int32_t val, int32_t min_val, int32_t max_val) {
    if (val < min_val) return min_val;
    if (val > max_val) return max_val;
    return val;
}

/** Absolute value of a 64-bit signed integer. INT64_MIN returns INT64_MAX. */
int64_t abs_i64(int64_t x) {
    if (x == INT64_MIN) return INT64_MAX;
    return x < 0 ? -x : x;
}

/** Smaller of two unsigned 32-bit integers. */
uint32_t min_u32(uint32_t a, uint32_t b) {
    return a < b ? a : b;
}

/** Larger of two unsigned 32-bit integers. */
uint32_t max_u32(uint32_t a, uint32_t b) {
    return a > b ? a : b;
}

/** Saturating addition: clamps to INT32_MAX on overflow, INT32_MIN on underflow. */
int32_t saturating_add_i32(int32_t a, int32_t b) {
    if (b > 0 && a > INT32_MAX - b) return INT32_MAX;
    if (b < 0 && a < INT32_MIN - b) return INT32_MIN;
    return a + b;
}

/** Wrapping (modular) addition — same as C's default signed overflow but explicit. */
uint32_t wrapping_add_u32(uint32_t a, uint32_t b) {
    return a + b;  /* unsigned overflow is well-defined in C */
}

/* ── Floating-point utilities ─────────────────────────────────────────────────*/

/**
 * Linear interpolation between a and b by factor t in [0.0, 1.0].
 * lerp(a, b, 0.0) == a, lerp(a, b, 1.0) == b.
 * t outside [0, 1] extrapolates.
 */
double lerp_f64(double a, double b, double factor) {
    return a + factor * (b - a);
}

/** Clamp a double to [lo, hi]. Propagates NaN. */
double clamp_f64(double val, double lo, double hi) {
    if (val != val) return val;  /* NaN check — avoids <math.h> dependency for this */
    if (val < lo) return lo;
    if (val > hi) return hi;
    return val;
}

/** Remap val from [in_lo, in_hi] into [out_lo, out_hi]. */
double remap_f64(double val, double in_lo, double in_hi, double out_lo, double out_hi) {
    double t = (val - in_lo) / (in_hi - in_lo);
    return out_lo + t * (out_hi - out_lo);
}

/** Returns 1 if x is NaN, 0 otherwise. */
int32_t is_nan_f64(double x) {
    return isnan(x) ? 1 : 0;
}

/** Returns 1 if x is finite (not ±Inf and not NaN), 0 otherwise. */
int32_t is_finite_f64(double x) {
    return isfinite(x) ? 1 : 0;
}

/**
 * Compute x raised to the power exp using integer exponentiation (exponentiation
 * by squaring).  Exact for integer exponents, no floating-point rounding from pow().
 * exp must be >= 0.  Returns 1 for exp == 0 (including base == 0).
 */
double ipow_f64(double base, int32_t exp) {
    if (exp < 0) return 0.0;  /* not supported — return sentinel */
    double result = 1.0;
    double b = base;
    int32_t e = exp;
    while (e > 0) {
        if (e & 1) result *= b;
        b *= b;
        e >>= 1;
    }
    return result;
}

/* ── Single-precision ─────────────────────────────────────────────────────────*/

/** Clamp a float to [lo, hi]. Propagates NaN. */
float clamp_f32(float val, float lo, float hi) {
    if (val != val) return val;
    if (val < lo) return lo;
    if (val > hi) return hi;
    return val;
}

/** Normalise val into [0.0f, 1.0f] from [lo, hi]. */
float normalize_f32(float val, float lo, float hi) {
    return (val - lo) / (hi - lo);
}

/* ── Boolean query ────────────────────────────────────────────────────────────*/

/**
 * Returns 1 (true) if n is a power of two, 0 otherwise.
 * n <= 0 always returns 0.
 */
int32_t is_pow2_i32(int32_t n) {
    return (n > 0 && (n & (n - 1)) == 0) ? 1 : 0;
}
