#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <stdlib.h>

/* Calls fn(x) and returns the result */
int32_t apply_i32(int32_t (*fn)(int32_t), int32_t x) {
    return fn(x);
}

/* Calls fn(fn(x)) and returns the result */
int32_t apply_twice(int32_t (*fn)(int32_t), int32_t x) {
    return fn(fn(x));
}

/* Maps arr in place: arr[i] = fn(arr[i]) */
void transform_array(int32_t *arr, int32_t len, int32_t (*fn)(int32_t)) {
    for (int32_t i = 0; i < len; i++) {
        arr[i] = fn(arr[i]);
    }
}

/* Left-fold: acc = fn(acc, arr[i]) for each element */
int32_t reduce_i32(int32_t *arr, int32_t len, int32_t init, int32_t (*fn)(int32_t, int32_t)) {
    int32_t acc = init;
    for (int32_t i = 0; i < len; i++) {
        acc = fn(acc, arr[i]);
    }
    return acc;
}

/* Calls fn(msg) */
void call_with_message(void (*fn)(const char *), const char *msg) {
    fn(msg);
}

/* Bubble sort using caller-supplied comparator.
   cmp(a, b) should return negative if a < b, zero if equal, positive if a > b. */
void sort_ints(int32_t *arr, int32_t len, int32_t (*cmp)(int32_t, int32_t)) {
    for (int32_t i = 0; i < len - 1; i++) {
        for (int32_t j = 0; j < len - 1 - i; j++) {
            if (cmp(arr[j], arr[j + 1]) > 0) {
                int32_t tmp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = tmp;
            }
        }
    }
}

/* Counts elements where pred(elem) is true; stores count in *out and returns it. */
int32_t count_matching(int32_t *arr, int32_t len, bool (*pred)(int32_t), int32_t *out) {
    int32_t count = 0;
    for (int32_t i = 0; i < len; i++) {
        if (pred(arr[i])) {
            count++;
        }
    }
    if (out != NULL) {
        *out = count;
    }
    return count;
}
