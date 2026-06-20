import assert from 'node:assert/strict'
import process from 'node:process'

globalThis.process ??= process

const target = process.argv[2]

if (!['linux', 'macos', 'windows'].includes(target)) {
  throw new Error('Usage: os-bindings.mjs <linux|macos|windows>')
}

if (target === 'linux') {
  assert.equal(process.platform, 'linux')

  const {
    linuxLibraryPaths,
    openLibc,
    openLibm,
  } = await import('../../dist/linux.js')

  const libc = await openLibc()
  try {
    assert.equal(libc.symbols.getpid(), process.pid)
    assert.equal(libc.symbols.strlen('unffi'), 5n)
    assert.equal(libc.symbols.strcmp('unffi', 'unffi'), 0)
    assert.ok(libc.symbols.strcmp('abc', 'abd') < 0)
    assert.ok(libc.symbols.strcmp('abd', 'abc') > 0)
  } finally {
    await libc[Symbol.asyncDispose]()
  }

  const libm = await openLibm()
  try {
    assert.equal(libm.symbols.sqrt(81), 9)
    assert.equal(libm.symbols.cos(0), 1)
  } finally {
    await libm[Symbol.asyncDispose]()
  }

  const original = process.env.UNFFI_LIBC_PATH
  process.env.UNFFI_LIBC_PATH = linuxLibraryPaths.libc.bare
  try {
    const overrideLibc = await openLibc()
    try {
      assert.equal(overrideLibc.symbols.getpid(), process.pid)
    } finally {
      await overrideLibc[Symbol.asyncDispose]()
    }
  } finally {
    restoreEnv('UNFFI_LIBC_PATH', original)
  }
}

if (target === 'macos') {
  assert.equal(process.platform, 'darwin')

  const {
    macosLibraryPaths,
    openCoreFoundation,
    openLibSystem,
  } = await import('../../dist/macos.js')

  const libSystem = await openLibSystem()
  try {
    assert.equal(libSystem.symbols.getpid(), process.pid)
    assert.equal(libSystem.symbols.strlen('unffi'), 5n)
    assert.equal(libSystem.symbols.strcmp('unffi', 'unffi'), 0)
    assert.ok(libSystem.symbols.strcmp('abc', 'abd') < 0)
    assert.ok(libSystem.symbols.strcmp('abd', 'abc') > 0)
    assert.equal(libSystem.symbols.atoi('42'), 42)
  } finally {
    await libSystem[Symbol.asyncDispose]()
  }

  const coreFoundation = await openCoreFoundation()
  try {
    const now = coreFoundation.symbols.CFAbsoluteTimeGetCurrent()
    assert.equal(Number.isFinite(now), true)
    assert.ok(now > 0)
    assert.notEqual(coreFoundation.symbols.CFStringGetTypeID(), 0n)
  } finally {
    await coreFoundation[Symbol.asyncDispose]()
  }

  const original = process.env.UNFFI_LIBSYSTEM_PATH
  process.env.UNFFI_LIBSYSTEM_PATH = macosLibraryPaths.libSystem.candidates[0]
  try {
    const overrideLibSystem = await openLibSystem()
    try {
      assert.equal(overrideLibSystem.symbols.getpid(), process.pid)
    } finally {
      await overrideLibSystem[Symbol.asyncDispose]()
    }
  } finally {
    restoreEnv('UNFFI_LIBSYSTEM_PATH', original)
  }
}

if (target === 'windows') {
  assert.equal(process.platform, 'win32')

  const {
    openKernel32,
    windowsLibraryPaths,
  } = await import('../../dist/windows.js')

  const kernel32 = await openKernel32()
  try {
    if (typeof process.pid === 'number') {
      assert.equal(kernel32.symbols.GetCurrentProcessId(), process.pid)
    }
    assert.ok(kernel32.symbols.GetCurrentThreadId() > 0)
    assert.ok(kernel32.symbols.GetTickCount64() > 0n)
    assert.equal(kernel32.symbols.lstrlenA('hello'), 5)
  } finally {
    await kernel32[Symbol.asyncDispose]()
  }

  const original = process.env.UNFFI_KERNEL32_PATH
  process.env.UNFFI_KERNEL32_PATH = windowsLibraryPaths.kernel32.candidates[0]
  try {
    const overrideKernel32 = await openKernel32()
    try {
      assert.equal(overrideKernel32.symbols.GetCurrentProcessId(), process.pid)
    } finally {
      await overrideKernel32[Symbol.asyncDispose]()
    }
  } finally {
    restoreEnv('UNFFI_KERNEL32_PATH', original)
  }
}

console.log(`OK ${target}`)

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
