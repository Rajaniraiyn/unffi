// Cross-runtime NAPI test: bcrypt via unffi/napi
// Usage:
//   bun   run tests/napi-bcrypt.js
//   deno  run -A tests/napi-bcrypt.js
//   fnm exec --using=22 node  tests/napi-bcrypt.js
//   fnm exec --using=26 node  tests/napi-bcrypt.js

async function main() {
  const { dlopen, t } = await import('../src/adapters/napi.js')

  const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
  const PLATFORM = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux'
  const BCRYPT = `node_modules/bcrypt/prebuilds/${PLATFORM}-${ARCH}/bcrypt.node`
  const { symbols, close } = dlopen(BCRYPT, {
    gen_salt_sync: { args: [t.cstring, t.i32, t.buffer], returns: t.cstring },
    encrypt_sync:  { args: [t.cstring, t.cstring], returns: t.cstring },
    compare_sync:  { args: [t.cstring, t.cstring], returns: t.bool },
    get_rounds:    { args: [t.cstring], returns: t.i32 },
  })

  const seed = new Uint8Array(16)
  crypto.getRandomValues(seed)

  const salt = symbols.gen_salt_sync('b', 10, seed)
  if (!salt.startsWith('$2b$') || salt.length !== 29) {
    throw new Error(`gen_salt_sync failed: ${salt}`)
  }
  console.log('✓ gen_salt_sync: salt =', salt)

  const hash = symbols.encrypt_sync('hunter2', salt)
  if (!hash.startsWith('$2b$') || hash.length !== 60) {
    throw new Error(`encrypt_sync failed: ${hash}`)
  }
  console.log('✓ encrypt_sync: hash =', hash)

  if (symbols.compare_sync('hunter2', hash) !== true) {
    throw new Error('compare_sync(true) failed')
  }
  console.log('✓ compare_sync: correct password matches')

  if (symbols.compare_sync('wrong', hash) !== false) {
    throw new Error('compare_sync(false) failed')
  }
  console.log('✓ compare_sync: wrong password rejected')

  if (symbols.get_rounds(hash) !== 10) {
    throw new Error('get_rounds failed')
  }
  console.log('✓ get_rounds: rounds = 10')

  close()
  console.log('\nAll NAPI bcrypt tests passed')
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
