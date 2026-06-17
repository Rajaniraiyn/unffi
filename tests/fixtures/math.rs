// Rust equivalents of math.c for FFI testing.
// compile with: rustc --crate-type=cdylib -o libmath_rs.dylib math.rs
//
// NOTE: Rust panics must not unwind across FFI — wrap fallible code in
// std::panic::catch_unwind and convert the result to a safe return value.

#![allow(non_snake_case)]

use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::sync::OnceLock;

/* Basic arithmetic */

#[no_mangle] pub extern "C" fn add_i8(a: i8, b: i8) -> i8 { a.wrapping_add(b) }
#[no_mangle] pub extern "C" fn add_i16(a: i16, b: i16) -> i16 { a.wrapping_add(b) }
#[no_mangle] pub extern "C" fn add_i32(a: i32, b: i32) -> i32 { a.wrapping_add(b) }
#[no_mangle] pub extern "C" fn add_i64(a: i64, b: i64) -> i64 { a.wrapping_add(b) }
#[no_mangle] pub extern "C" fn add_u8(a: u8, b: u8) -> u8 { a.wrapping_add(b) }
#[no_mangle] pub extern "C" fn add_u16(a: u16, b: u16) -> u16 { a.wrapping_add(b) }
#[no_mangle] pub extern "C" fn add_u32(a: u32, b: u32) -> u32 { a.wrapping_add(b) }
#[no_mangle] pub extern "C" fn add_u64(a: u64, b: u64) -> u64 { a.wrapping_add(b) }
#[no_mangle] pub extern "C" fn add_f32(a: f32, b: f32) -> f32 { a + b }
#[no_mangle] pub extern "C" fn add_f64(a: f64, b: f64) -> f64 { a + b }

/* Comparisons */

#[no_mangle] pub extern "C" fn gt_i32(a: i32, b: i32) -> bool { a > b }
#[no_mangle] pub extern "C" fn is_zero_f64(x: f64) -> bool { x == 0.0 }

/* String: returns pointer to a thread-local static CString buffer.
   The returned pointer is valid until the next call to greet on the same thread. */

#[no_mangle]
pub extern "C" fn greet(name: *const c_char) -> *const c_char {
    use std::cell::RefCell;
    thread_local! {
        static BUF: RefCell<Option<CString>> = RefCell::new(None);
    }
    let result = std::panic::catch_unwind(|| {
        let name_str = unsafe { CStr::from_ptr(name) }.to_string_lossy();
        let greeting = format!("Hello, {}", name_str);
        CString::new(greeting).expect("interior nul byte")
    });
    match result {
        Ok(cs) => BUF.with(|cell| {
            *cell.borrow_mut() = Some(cs);
            cell.borrow().as_ref().unwrap().as_ptr()
        }),
        Err(_) => std::ptr::null(),
    }
}

/* Void return */

#[no_mangle] pub extern "C" fn noop() {}

/* Pointer: increment in place */

#[no_mangle]
pub extern "C" fn increment(ptr: *mut i32) {
    if !ptr.is_null() {
        unsafe { *ptr = (*ptr).wrapping_add(1) };
    }
}

/* Buffer sum */

#[no_mangle]
pub extern "C" fn sum_i32(buf: *const i32, len: i32) -> i32 {
    if buf.is_null() || len <= 0 {
        return 0;
    }
    let slice = unsafe { std::slice::from_raw_parts(buf, len as usize) };
    slice.iter().fold(0i32, |acc, &x| acc.wrapping_add(x))
}

/* Identity functions */

#[no_mangle] pub extern "C" fn identity_i8(x: i8) -> i8 { x }
#[no_mangle] pub extern "C" fn identity_i16(x: i16) -> i16 { x }
#[no_mangle] pub extern "C" fn identity_i32(x: i32) -> i32 { x }
#[no_mangle] pub extern "C" fn identity_i64(x: i64) -> i64 { x }
#[no_mangle] pub extern "C" fn identity_u8(x: u8) -> u8 { x }
#[no_mangle] pub extern "C" fn identity_u16(x: u16) -> u16 { x }
#[no_mangle] pub extern "C" fn identity_u32(x: u32) -> u32 { x }
#[no_mangle] pub extern "C" fn identity_u64(x: u64) -> u64 { x }
#[no_mangle] pub extern "C" fn identity_f32(x: f32) -> f32 { x }
#[no_mangle] pub extern "C" fn identity_f64(x: f64) -> f64 { x }
#[no_mangle] pub extern "C" fn identity_bool(x: bool) -> bool { x }
