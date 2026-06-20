# UnFFI

[![npm version](https://img.shields.io/npm/v/unffi?style=flat-square)](https://www.npmjs.com/package/unffi) [![license](https://img.shields.io/npm/l/unffi?style=flat-square)](./LICENSE) [![CI](https://img.shields.io/github/actions/workflow/status/rajaniraiyn/unffi/ci.yml?style=flat-square&label=CI)](https://github.com/rajaniraiyn/unffi/actions)

Universal FFI for Bun, Deno, and Node.js — one schema, runtime-native performance.

## Install

```sh
npm install unffi
pnpm add unffi
yarn add unffi
bun add unffi
```

## Quick Start

```ts
import { dlopen, t } from 'unffi'

// Compile: cc -shared -o libgreeter.dylib greeter.c
// char* greet(const char* name);
// void on_greet(void (*cb)(const char*), const char* name);

await using lib = await dlopen('./libgreeter', {
  greet: {
    args: [t.cstring],
    returns: t.cstring,
  },
  on_greet: {
    args: [t.fn([t.cstring], t.void), t.cstring],
    returns: t.void,
  },
})

console.log(lib.symbols.greet('world'))
// → "Hello, world!"

lib.symbols.on_greet((msg) => console.log(msg), 'unffi')
// → "Hello, unffi!"

// lib.close() called automatically via await using (Symbol.asyncDispose)
```

## Runtimes

| Runtime | FFI backend | Notes |
|---------|-------------|-------|
| Bun | `bun:ffi` | Zero overhead, native types |
| Deno | `Deno.dlopen` | `usize`/`isize` platform types |
| Node.js | `node:ffi` (Node 26+) → koffi | koffi is an optional peer dep, installed automatically |

## How it works

`unffi` ships separate adapter modules for each runtime and uses `package.json` export conditions (`"bun"`, `"deno"`, `"node"`) so the runtime loads the right adapter with no branching in your code. Each adapter translates the shared `t.xxx` type tokens into whatever representation that runtime expects — `bun:ffi` type strings, `Deno.NativeType`, or koffi signatures. On Node 26+, the native `node:ffi` module is preferred; koffi is the fallback for older Node versions.

## Runtime-specific types

Import from `unffi/types` to access types not in the universal core.

- `t.bun.i64_fast` — i64 as `number` instead of `bigint` when Bun can fit it safely
- `t.deno.usize` / `t.deno.isize` — pointer-width integers on the current platform
- `t.koffi.struct(layout)` — define a C struct layout for koffi on Node.js

## System library helpers

OS-specific helpers are available from `unffi/linux`, `unffi/macos`, and `unffi/windows`. Path resolution utilities are available from `unffi/paths`.

Generated library subpaths expose focused, typed bindings for common system APIs:

```ts
import { openCoreFoundation } from 'unffi/macos/CoreFoundation'
import { openLibc } from 'unffi/linux/libc'
import { openKernel32 } from 'unffi/windows/kernel32'

await using cf = await openCoreFoundation()
console.log(cf.symbols.CFStringGetTypeID())

await using libc = await openLibc()
console.log(libc.symbols.getpid())

await using kernel32 = await openKernel32()
console.log(kernel32.symbols.GetCurrentProcessId())
```

The generated surface is intentionally conservative: unsupported ABI shapes such as C++ classes, Objective-C messaging, COM vtables, variadic functions, bitfields, and ownership-heavy structs are skipped until `unffi` can model them safely.

## Header generation plugins

`unffi/unplugin` can generate typed binding modules from project-local `.h` and `.hpp` files in Vite, Rollup, Webpack, Rspack, esbuild, and Bun builds:

```ts
// vite.config.ts
import { vite as unffi } from 'unffi/unplugin'

export default {
  plugins: [
    unffi({
      entries: [{
        name: 'math',
        header: './native/math.h',
        libraryNames: ['./native/libmath'],
      }],
    }),
  ],
}
```

```ts
import { openMath } from 'virtual:unffi/bindings/math'

await using math = await openMath()
```

Full API docs: [rajaniraiyn.github.io/unffi](https://rajaniraiyn.github.io/unffi)

## License

MIT
