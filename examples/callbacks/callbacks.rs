// callbacks.rs — Rust equivalents of callbacks.c for use with unffi
//
// Compile on macOS:
//   rustc --crate-type=cdylib -o libcallbacks.dylib callbacks.rs
//
// Compile on Linux:
//   rustc --crate-type=cdylib -o libcallbacks.so callbacks.rs
//
// Or add to Cargo.toml:
//   [lib]
//   crate-type = ["cdylib"]

use std::os::raw::{c_char, c_int};
use std::sync::atomic::{AtomicPtr, Ordering};

// ── for_each ──────────────────────────────────────────────────────────────────
// Iterate over an array and call fn(index, value) for each element.
// The callback receives the zero-based index and the element value.
//
// Safety: arr must point to len valid i32 values.
#[no_mangle]
pub unsafe extern "C" fn for_each(
    arr: *const i32,
    len: i32,
    f: extern "C" fn(index: i32, value: i32),
) {
    if arr.is_null() || len <= 0 {
        return;
    }
    for i in 0..len {
        // Safety: arr + i is within the [0, len) range checked above.
        let value = unsafe { *arr.add(i as usize) };
        f(i, value);
    }
}

// ── map_i32 ───────────────────────────────────────────────────────────────────
// Transform each element of src into dst by applying f to each value.
// dst must point to a buffer of at least len elements.
//
// Safety: src and dst must each point to len valid i32 values.
// src and dst must not alias.
#[no_mangle]
pub unsafe extern "C" fn map_i32(
    src: *const i32,
    dst: *mut i32,
    len: i32,
    f: extern "C" fn(value: i32) -> i32,
) {
    if src.is_null() || dst.is_null() || len <= 0 {
        return;
    }
    for i in 0..len {
        let value = unsafe { *src.add(i as usize) };
        let mapped = f(value);
        unsafe { *dst.add(i as usize) = mapped };
    }
}

// ── filter_count ──────────────────────────────────────────────────────────────
// Count how many elements in arr satisfy the predicate f.
// f returns non-zero for "keep", zero for "discard".
// Returns 0 if arr is null or len is non-positive.
//
// Safety: arr must point to len valid i32 values.
#[no_mangle]
pub unsafe extern "C" fn filter_count(
    arr: *const i32,
    len: i32,
    f: extern "C" fn(value: i32) -> c_int,
) -> i32 {
    if arr.is_null() || len <= 0 {
        return 0;
    }
    let mut count = 0i32;
    for i in 0..len {
        let value = unsafe { *arr.add(i as usize) };
        if f(value) != 0 {
            count += 1;
        }
    }
    count
}

// ── Event emitter — module-level callback slot ────────────────────────────────
// A single global handler pointer stored atomically.
// AtomicPtr provides interior mutability without a Mutex for this single-slot
// pattern. Concurrent registration from multiple threads is a data race on the
// application level — callers are expected to register before firing events.

type HandlerFn = extern "C" fn(event_type: i32, data: *const c_char);

// Store the handler as a raw function pointer cast to *mut ().
static HANDLER: AtomicPtr<()> = AtomicPtr::new(std::ptr::null_mut());

/// Register a callback to receive events.
/// Pass a null function pointer to unregister.
///
/// The function pointer convention matches the C version: extern "C" fn(i32, *const c_char).
/// C callers pass a normal function pointer; JS callers pass a trampoline allocated by
/// the unffi adapter (JSCallback / Deno.UnsafeCallback).
#[no_mangle]
pub extern "C" fn register_handler(
    on_event: Option<extern "C" fn(event_type: i32, data: *const c_char)>,
) {
    let ptr = match on_event {
        Some(f) => f as *mut (),
        None => std::ptr::null_mut(),
    };
    HANDLER.store(ptr, Ordering::Release);
}

/// Dispatch an event to the registered handler.
/// Does nothing if no handler has been registered.
/// data must be a valid UTF-8 null-terminated string, or null.
///
/// This function does not unwind across the FFI boundary — panics inside a
/// registered Rust handler would be caught by the std::panic::catch_unwind
/// wrapper that Rust inserts for extern "C" boundaries in Rust ≥ 1.73.
/// For JS callbacks the JS engine handles any thrown exceptions internally.
#[no_mangle]
pub extern "C" fn fire_event(event_type: i32, data: *const c_char) {
    let raw = HANDLER.load(Ordering::Acquire);
    if raw.is_null() {
        return;
    }
    // Safety: HANDLER contains either null or a valid HandlerFn written by
    // register_handler.  The acquire/release pair ensures visibility.
    let handler: HandlerFn = unsafe { std::mem::transmute(raw) };

    // Normalise a null data pointer to an empty string so the handler always
    // receives a valid pointer — mirrors the C implementation.
    let empty = b"\0";
    let safe_data = if data.is_null() {
        empty.as_ptr() as *const c_char
    } else {
        data
    };

    handler(event_type, safe_data);
}
