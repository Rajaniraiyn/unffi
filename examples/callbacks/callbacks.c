/**
 * callbacks.c — C callback patterns for use with unffi
 *
 * Compile on macOS:
 *   cc -shared -fPIC -o libcallbacks.dylib callbacks.c
 *
 * Compile on Linux:
 *   cc -shared -fPIC -o libcallbacks.so callbacks.c
 *
 * Compile on Windows (MSVC):
 *   cl /LD callbacks.c /Fe:callbacks.dll
 */

#include <stdint.h>
#include <string.h>

/* ── for_each ──────────────────────────────────────────────────────────────────
 * Iterate over an array and call fn(index, value) for each element.
 * The callback receives the zero-based index and the element value.
 * This mirrors Array.prototype.forEach on the C side.
 */
void for_each(
    const int32_t *arr,
    int32_t        len,
    void         (*fn)(int32_t index, int32_t value)
) {
    for (int32_t i = 0; i < len; i++) {
        fn(i, arr[i]);
    }
}

/* ── map_i32 ───────────────────────────────────────────────────────────────────
 * Transform each element of src into dst by applying fn to each value.
 * dst must point to a buffer of at least len elements.
 * The callback must be pure — it must not modify src or dst.
 */
void map_i32(
    const int32_t *src,
    int32_t       *dst,
    int32_t        len,
    int32_t      (*fn)(int32_t value)
) {
    for (int32_t i = 0; i < len; i++) {
        dst[i] = fn(src[i]);
    }
}

/* ── filter_count ──────────────────────────────────────────────────────────────
 * Count how many elements in arr satisfy the predicate fn.
 * fn returns non-zero for "keep", zero for "discard" — matches C convention
 * for boolean returns (int, not _Bool, for maximum ABI compatibility).
 */
int32_t filter_count(
    const int32_t *arr,
    int32_t        len,
    int32_t      (*fn)(int32_t value)
) {
    int32_t count = 0;
    for (int32_t i = 0; i < len; i++) {
        if (fn(arr[i])) {
            count++;
        }
    }
    return count;
}

/* ── Event emitter — module-level callback slot ────────────────────────────────
 * A single global handler can be registered.  fire_event() calls it
 * synchronously.  Registering a NULL handler clears it.
 *
 * Event types (use in JS as plain integer constants):
 *   0 — CONNECTED
 *   1 — DATA
 *   2 — DISCONNECTED
 */

/* The registered handler — NULL until register_handler() is called. */
static void (*g_handler)(int32_t type, const char *data) = NULL;

/**
 * Register a callback to receive events.
 * Pass NULL to unregister and stop receiving events.
 */
void register_handler(void (*on_event)(int32_t type, const char *data)) {
    g_handler = on_event;
}

/**
 * Dispatch an event to the registered handler.
 * Does nothing if no handler is registered.
 * data must be a valid UTF-8 null-terminated C string, or NULL.
 */
void fire_event(int32_t type, const char *data) {
    if (g_handler != NULL) {
        g_handler(type, data != NULL ? data : "");
    }
}
