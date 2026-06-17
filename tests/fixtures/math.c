// Compile:
//   macOS:  cc -shared -fPIC -o /tmp/unffi_math.dylib tests/fixtures/math.c
//   Linux:  cc -shared -fPIC -o /tmp/unffi_math.so   tests/fixtures/math.c
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdio.h>

// ── primitives ────────────────────────────────────────────────────────────────

int8_t   add_i8 (int8_t  a, int8_t  b) { return a + b; }
int16_t  add_i16(int16_t a, int16_t b) { return a + b; }
int32_t  add_i32(int32_t a, int32_t b) { return a + b; }
int64_t  add_i64(int64_t a, int64_t b) { return a + b; }
uint8_t  add_u8 (uint8_t  a, uint8_t  b) { return a + b; }
uint16_t add_u16(uint16_t a, uint16_t b) { return a + b; }
uint32_t add_u32(uint32_t a, uint32_t b) { return a + b; }
uint64_t add_u64(uint64_t a, uint64_t b) { return a + b; }
float    add_f32(float  a, float  b) { return a + b; }
double   add_f64(double a, double b) { return a + b; }

int32_t  identity_i32(int32_t x) { return x; }
int64_t  identity_i64(int64_t x) { return x; }
double   identity_f64(double  x) { return x; }

bool     gt_i32(int32_t a, int32_t b) { return a > b; }

void     noop(void) {}

// ── cstring ───────────────────────────────────────────────────────────────────

// Returns a static buffer — safe for single-threaded tests
const char *greet(const char *name) {
    static char buf[256];
    snprintf(buf, sizeof(buf), "Hello, %s", name);
    return buf;
}

// ── buffer ────────────────────────────────────────────────────────────────────

int32_t sum_i32(int32_t *buf, int32_t len) {
    int32_t acc = 0;
    for (int32_t i = 0; i < len; i++) acc += buf[i];
    return acc;
}

// ── callbacks ─────────────────────────────────────────────────────────────────

// apply fn(x)
int32_t apply(int32_t (*fn)(int32_t), int32_t x) { return fn(x); }

// left-fold: reduce(arr, len, init, fn(acc, x) -> acc)
int32_t reduce_i32(int32_t *arr, int32_t len, int32_t init,
                   int32_t (*fn)(int32_t, int32_t)) {
    int32_t acc = init;
    for (int32_t i = 0; i < len; i++) acc = fn(acc, arr[i]);
    return acc;
}

// bubble sort with caller-supplied comparator (returns negative if a < b)
void sort_i32(int32_t *arr, int32_t len,
              int32_t (*cmp)(int32_t, int32_t)) {
    for (int32_t i = 0; i < len - 1; i++)
        for (int32_t j = 0; j < len - 1 - i; j++)
            if (cmp(arr[j], arr[j + 1]) > 0) {
                int32_t t = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = t;
            }
}

// calls fn(msg) — demonstrates cstring through a callback arg
void with_message(void (*fn)(const char *), const char *msg) { fn(msg); }
