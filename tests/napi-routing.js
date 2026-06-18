// Verify .node routing through the runtime's generic dlopen
// This tests that node.ts routes .node files to the napi adapter.

async function main() {
  const { dlopen } = await import('../src/adapters/node.js')

  const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
  const PLATFORM = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux'
  const BCRYPT = `node_modules/bcrypt/prebuilds/${PLATFORM}-${ARCH}/bcrypt.node`

  // Empty schema — just verify the addon loads without error
  const { symbols, close } = dlopen(BCRYPT, {})
  if (typeof symbols !== 'object' || symbols === null) {
    throw new Error('symbols should be an object')
  }
  close()
  console.log('✓ Node .node routing: bcrypt loaded via node.ts → napi adapter')
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
