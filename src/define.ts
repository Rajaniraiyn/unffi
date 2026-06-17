import type { CType, CCallback, InferCType, InferTuple } from './types.js'

export interface SymbolDef {
  readonly args: readonly CType<any>[]
  readonly returns: CType<any>
  readonly async?: boolean
}

export type SymbolsSchema = Record<string, SymbolDef>

type InferReturn<S extends SymbolDef> =
  S['async'] extends true
    ? Promise<InferCType<S['returns']>>
    : InferCType<S['returns']>

type MapArg<T extends CType<any>> =
  T extends CCallback<infer A extends readonly CType<any>[], infer R extends CType<any>>
    ? (...args: InferTuple<A>) => InferCType<R>
    : InferCType<T>

type MapArgs<T extends readonly CType<any>[]> =
  T extends readonly []
    ? []
    : T extends readonly [infer H extends CType<any>, ...infer R extends CType<any>[]]
      ? [MapArg<H>, ...MapArgs<R>]
      : { [K in keyof T]: T[K] extends CType<any> ? MapArg<T[K]> : never }

export type InferSymbolFn<S extends SymbolDef> =
  (...args: MapArgs<[...S['args']]>) => InferReturn<S>

export type InferLibrary<S extends SymbolsSchema> = {
  readonly symbols: { readonly [K in keyof S]: InferSymbolFn<S[K]> }
  close(): void
  [Symbol.dispose](): void
  [Symbol.asyncDispose](): Promise<void>
}
