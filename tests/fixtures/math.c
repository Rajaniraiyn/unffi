#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

/* Basic arithmetic for every integer/float type */

int8_t add_i8(int8_t a, int8_t b) { return a + b; }
int16_t add_i16(int16_t a, int16_t b) { return a + b; }
int32_t add_i32(int32_t a, int32_t b) { return a + b; }
int64_t add_i64(int64_t a, int64_t b) { return a + b; }
uint8_t add_u8(uint8_t a, uint8_t b) { return a + b; }
uint16_t add_u16(uint16_t a, uint16_t b) { return a + b; }
uint32_t add_u32(uint32_t a, uint32_t b) { return a + b; }
uint64_t add_u64(uint64_t a, uint64_t b) { return a + b; }
float add_f32(float a, float b) { return a + b; }
double add_f64(double a, double b) { return a + b; }

/* Comparisons */

bool gt_i32(int32_t a, int32_t b) { return a > b; }
bool is_zero_f64(double x) { return x == 0.0; }

/* String: returns static buffer with "Hello, <name>" */

const char *greet(const char *name) {
    static char buf[256];
    snprintf(buf, sizeof(buf), "Hello, %s", name);
    return buf;
}

/* Void return */

void noop(void) { }

/* Pointer: increment in place */

void increment(int32_t *ptr) { ptr[0]++; }

/* Buffer sum */

int32_t sum_i32(int32_t *buf, int32_t len) {
    int32_t acc = 0;
    for (int32_t i = 0; i < len; i++) {
        acc += buf[i];
    }
    return acc;
}

/* Identity functions */

int8_t identity_i8(int8_t x) { return x; }
int16_t identity_i16(int16_t x) { return x; }
int32_t identity_i32(int32_t x) { return x; }
int64_t identity_i64(int64_t x) { return x; }
uint8_t identity_u8(uint8_t x) { return x; }
uint16_t identity_u16(uint16_t x) { return x; }
uint32_t identity_u32(uint32_t x) { return x; }
uint64_t identity_u64(uint64_t x) { return x; }
float identity_f32(float x) { return x; }
double identity_f64(double x) { return x; }
bool identity_bool(bool x) { return x; }
