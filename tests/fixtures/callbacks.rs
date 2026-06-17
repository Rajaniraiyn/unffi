// Rust equivalents of callbacks.c for FFI testing.
// compile with: rustc --crate-type=cdylib -o libcallbacks_rs.dylib callbacks.rs
//
// Rust fn pointer type syntax for FFI:
//   Option<unsafe extern "C" fn(T) -> U>
// Using Option<...> makes the pointer nullable (FFI-safe null representation).
// Rust panics must not unwind across FFI — wrap fallible code in
// std::panic::catch_unwind and return a safe sentinel value on panic.

#![allow(non_snake_case)]

use std::os::raw::c_char;

/* Calls fn(x) and returns the result */
#[no_mangle]
pub extern "C" fn apply_i32(
    f: Option<unsafe extern "C" fn(i32) -> i32>,
    x: i32,
) -> i32 {
    match f {
        Some(func) => unsafe { func(x) },
        None => x,
    }
}

/* Calls fn(fn(x)) and returns the result */
#[no_mangle]
pub extern "C" fn apply_twice(
    f: Option<unsafe extern "C" fn(i32) -> i32>,
    x: i32,
) -> i32 {
    match f {
        Some(func) => unsafe { func(func(x)) },
        None => x,
    }
}

/* Maps arr in place: arr[i] = fn(arr[i]) */
#[no_mangle]
pub extern "C" fn transform_array(
    arr: *mut i32,
    len: i32,
    f: Option<unsafe extern "C" fn(i32) -> i32>,
) {
    if arr.is_null() || len <= 0 {
        return;
    }
    let func = match f {
        Some(func) => func,
        None => return,
    };
    let slice = unsafe { std::slice::from_raw_parts_mut(arr, len as usize) };
    for elem in slice.iter_mut() {
        *elem = unsafe { func(*elem) };
    }
}

/* Left-fold: acc = fn(acc, arr[i]) for each element */
#[no_mangle]
pub extern "C" fn reduce_i32(
    arr: *const i32,
    len: i32,
    init: i32,
    f: Option<unsafe extern "C" fn(i32, i32) -> i32>,
) -> i32 {
    if arr.is_null() || len <= 0 {
        return init;
    }
    let func = match f {
        Some(func) => func,
        None => return init,
    };
    let slice = unsafe { std::slice::from_raw_parts(arr, len as usize) };
    slice.iter().fold(init, |acc, &x| unsafe { func(acc, x) })
}

/* Calls fn(msg) */
#[no_mangle]
pub extern "C" fn call_with_message(
    f: Option<unsafe extern "C" fn(*const c_char)>,
    msg: *const c_char,
) {
    if let Some(func) = f {
        unsafe { func(msg) };
    }
}

/* Bubble sort using caller-supplied comparator.
   cmp(a, b) should return negative if a < b, zero if equal, positive if a > b. */
#[no_mangle]
pub extern "C" fn sort_ints(
    arr: *mut i32,
    len: i32,
    cmp: Option<unsafe extern "C" fn(i32, i32) -> i32>,
) {
    if arr.is_null() || len <= 1 {
        return;
    }
    let func = match cmp {
        Some(f) => f,
        None => return,
    };
    let slice = unsafe { std::slice::from_raw_parts_mut(arr, len as usize) };
    let n = slice.len();
    for i in 0..n - 1 {
        for j in 0..n - 1 - i {
            if unsafe { func(slice[j], slice[j + 1]) } > 0 {
                slice.swap(j, j + 1);
            }
        }
    }
}

/* Counts elements where pred(elem) is true; stores count in *out and returns it. */
#[no_mangle]
pub extern "C" fn count_matching(
    arr: *const i32,
    len: i32,
    pred: Option<unsafe extern "C" fn(i32) -> bool>,
    out: *mut i32,
) -> i32 {
    if arr.is_null() || len <= 0 {
        if !out.is_null() {
            unsafe { *out = 0 };
        }
        return 0;
    }
    let func = match pred {
        Some(f) => f,
        None => {
            if !out.is_null() {
                unsafe { *out = 0 };
            }
            return 0;
        }
    };
    let slice = unsafe { std::slice::from_raw_parts(arr, len as usize) };
    let count = slice.iter().filter(|&&x| unsafe { func(x) }).count() as i32;
    if !out.is_null() {
        unsafe { *out = count };
    }
    count
}
