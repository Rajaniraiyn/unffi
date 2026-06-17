// C ABI type tokens — phantom types for TypeScript inference, zero runtime cost

export interface CType<T> {
  readonly _type: T
  readonly kind: CTypeKind
}

export type CTypeKind =
  | 'void' | 'bool'
  | 'i8' | 'i16' | 'i32' | 'i64'
  | 'u8' | 'u16' | 'u32' | 'u64'
  | 'f32' | 'f64'
  | 'cstring' | 'pointer' | 'buffer'
  | 'function'

// Opaque pointer type — bigint under the hood (Bun/Deno both use bigint for pointers)
declare const PtrBrand: unique symbol
export type Ptr = bigint & { readonly [PtrBrand]: true }

function c<T>(kind: CTypeKind): CType<T> {
  return { kind } as unknown as CType<T>
}

export type InferCType<T extends CType<any>> = T extends CType<infer U> ? U : never

// Recursive tuple mapping — more reliable than mapped type for narrow const tuples
export type InferTuple<T extends readonly CType<any>[]> =
  T extends readonly []
    ? []
    : T extends readonly [infer H extends CType<any>, ...infer R extends CType<any>[]]
      ? [InferCType<H>, ...InferTuple<R>]
      : { [K in keyof T]: T[K] extends CType<infer U> ? U : never }

// Function-pointer / callback type
export interface CCallback<
  Args extends readonly CType<any>[],
  Ret extends CType<any>,
> extends CType<(...args: InferTuple<Args>) => InferCType<Ret>> {
  readonly kind: 'function'
  readonly argTypes: Args
  readonly returnType: Ret
}

// ─── CoreT interface ──────────────────────────────────────────────────────────
// Named interface for the base `t` object so adapters can extend it cleanly
// and IDE hover shows a readable type instead of an opaque intersection.

export interface CoreT {
  readonly void:    CType<void>
  readonly bool:    CType<boolean>
  readonly i8:      CType<number>
  readonly i16:     CType<number>
  readonly i32:     CType<number>
  readonly i64:     CType<bigint>
  readonly u8:      CType<number>
  readonly u16:     CType<number>
  readonly u32:     CType<number>
  readonly u64:     CType<bigint>
  readonly f32:     CType<number>
  readonly f64:     CType<number>
  readonly cstring: CType<string>
  readonly pointer: CType<Ptr | null>
  readonly buffer:  CType<ArrayBufferView>
  fn<const Args extends readonly CType<any>[], const Ret extends CType<any>>(
    args: Args,
    returns: Ret,
  ): CCallback<Args, Ret>
}

export const t: CoreT = {
  void:    c<void>('void'),
  bool:    c<boolean>('bool'),
  i8:      c<number>('i8'),
  i16:     c<number>('i16'),
  i32:     c<number>('i32'),
  i64:     c<bigint>('i64'),
  u8:      c<number>('u8'),
  u16:     c<number>('u16'),
  u32:     c<number>('u32'),
  u64:     c<bigint>('u64'),
  f32:     c<number>('f32'),
  f64:     c<number>('f64'),
  cstring: c<string>('cstring'),
  pointer: c<Ptr | null>('pointer'),
  buffer:  c<ArrayBufferView>('buffer'),
  fn<const Args extends readonly CType<any>[], const Ret extends CType<any>>(
    args: Args,
    returns: Ret,
  ): CCallback<Args, Ret> {
    return { kind: 'function', argTypes: args, returnType: returns } as unknown as CCallback<Args, Ret>
  },
}
