// Compile:
//   rustc --crate-type=cdylib -o /tmp/unffi_math_rs.dylib tests/fixtures/math.rs
//
// IMPORTANT: Rust panics must not unwind across FFI — use std::panic::catch_unwind
// in any fallible extern fn to avoid undefined behaviour.

#[no_mangle] pub extern "C" fn add_i8 (a: i8,  b: i8 ) -> i8  { a + b }
#[no_mangle] pub extern "C" fn add_i16(a: i16, b: i16) -> i16 { a + b }
#[no_mangle] pub extern "C" fn add_i32(a: i32, b: i32) -> i32 { a + b }
#[no_mangle] pub extern "C" fn add_i64(a: i64, b: i64) -> i64 { a + b }
#[no_mangle] pub extern "C" fn add_u8 (a: u8,  b: u8 ) -> u8  { a + b }
#[no_mangle] pub extern "C" fn add_u16(a: u16, b: u16) -> u16 { a + b }
#[no_mangle] pub extern "C" fn add_u32(a: u32, b: u32) -> u32 { a + b }
#[no_mangle] pub extern "C" fn add_u64(a: u64, b: u64) -> u64 { a + b }
#[no_mangle] pub extern "C" fn add_f32(a: f32, b: f32) -> f32 { a + b }
#[no_mangle] pub extern "C" fn add_f64(a: f64, b: f64) -> f64 { a + b }

#[no_mangle] pub extern "C" fn identity_i32(x: i32) -> i32 { x }
#[no_mangle] pub extern "C" fn identity_i64(x: i64) -> i64 { x }
#[no_mangle] pub extern "C" fn identity_f64(x: f64) -> f64 { x }

#[no_mangle] pub extern "C" fn gt_i32(a: i32, b: i32) -> bool { a > b }
#[no_mangle] pub extern "C" fn noop() {}

#[no_mangle] pub extern "C" fn sum_i32(buf: *const i32, len: i32) -> i32 {
    let slice = unsafe { std::slice::from_raw_parts(buf, len as usize) };
    slice.iter().sum()
}

#[no_mangle] pub extern "C" fn apply(
    f: extern "C" fn(i32) -> i32, x: i32,
) -> i32 { f(x) }

#[no_mangle] pub extern "C" fn reduce_i32(
    arr: *const i32, len: i32, init: i32,
    f: extern "C" fn(i32, i32) -> i32,
) -> i32 {
    let slice = unsafe { std::slice::from_raw_parts(arr, len as usize) };
    slice.iter().fold(init, |acc, &x| f(acc, x))
}
