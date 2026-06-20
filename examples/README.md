# UnFFI Examples

These examples show direct, typed calls into native system libraries. Each
script imports a generated OS subpath such as `unffi/macos/CoreFoundation`,
`unffi/linux/libc`, or `unffi/windows/kernel32`.

Run examples from a project that has `unffi` installed, or from this repo after
building the package.

```sh
bun run build
bun examples/macos/corefoundation-clock.ts
```

## macOS

- `macos/libsystem-process.ts` — process IDs and native C string helpers from `libSystem`.
- `macos/corefoundation-clock.ts` — CoreFoundation absolute time and type IDs.
- `macos/security-random.ts` — cryptographic bytes from `Security.framework`.
- `macos/systemconfiguration-metadata.ts` — safe metadata for SystemConfiguration pointer-returning APIs.

## Linux

- `linux/libc-process.ts` — process IDs and native C string helpers from libc.
- `linux/libm-native-math.ts` — native `libm` trigonometry and floating-point helpers.
- `linux/pthread-self.ts` — inspect and compare the current native pthread id.
- `linux/unistd-access.ts` — POSIX user/group IDs and filesystem access checks.
- `linux/libdl-metadata.ts` — safe metadata for dynamic-loader error bindings.

## Windows

- `windows/kernel32-process.ts` — process/thread IDs, uptime, and ANSI string length from `kernel32`.
- `windows/advapi32-username.ts` — native username lookup with output buffers.
- `windows/user32-system-metrics.ts` — screen metrics and double-click timing from `user32`.

Examples that touch pointer-owned APIs intentionally stop at metadata until
`unffi` grows higher-level ownership wrappers.
