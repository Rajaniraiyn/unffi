// Verify .node routing through the runtime's generic dlopen
// This tests that node.ts routes .node files to the napi adapter.

const { createRequire } = await import('module')
const req = createRequire(import.meta.url)

const bcryptDir = req.resolve('bcrypt/package.json').replace('/package.json', '')
const nodeGypBuild = req(req.resolve('node-gyp-build', { paths: [bcryptDir] }))
const bcryptNode = nodeGypBuild.path(bcryptDir)

const { dlopen } = await import('../src/adapters/node.js')

// Empty schema — just verify the addon loads without error
const { symbols, close } = dlopen(bcryptNode, {})
if (typeof symbols !== 'object' || symbols === null) {
  throw new Error('symbols should be an object')
}
close()
console.log('✓ Node .node routing: bcrypt loaded via node.ts → napi adapter')
