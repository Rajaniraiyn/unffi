export function runtimeHint(kind: string, self: 'bun' | 'deno' | 'node' | 'napi'): string {
  if (self !== 'bun'   && kind.startsWith('bun:'))   return 'This is a Bun-specific type — run with Bun. See https://bun.sh/docs/api/ffi'
  if (self !== 'deno'  && kind.startsWith('deno:'))  return 'This is a Deno-specific type — run with Deno. See https://docs.deno.com/runtime/fundamentals/ffi/'
  if (self !== 'node'  && kind.startsWith('node:'))  return 'This is a Node.js-specific type — run with Node.js.'
  if (self !== 'node'  && kind.startsWith('koffi:')) return 'This is a koffi-specific type — run with Node.js and install koffi. See https://koffi.dev'
  if (self !== 'napi'  && kind.startsWith('napi:'))  return 'This is a NAPI-specific type — run with Node.js and load a .node addon.'
  return 'Unknown type kind.'
}
