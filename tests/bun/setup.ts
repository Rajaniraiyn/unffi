import { afterAll, beforeAll } from "bun:test";
import { compileC, fixturePath, tmpLib } from "../helpers/index.ts";

export interface TestLibraries {
  mathLib: string;
  callbacksLib: string;
}

/**
 * Registers beforeAll/afterAll hooks that compile the C fixture files once
 * and clean up the resulting .dylib files after the suite finishes.
 *
 * Usage:
 *   import { setupLibraries } from "../bun/setup.ts";
 *   const libs = setupLibraries();
 *   // Then use libs.mathLib and libs.callbacksLib inside your tests.
 */
export function setupLibraries(): TestLibraries {
  const libs: TestLibraries = {
    mathLib: tmpLib("math"),
    callbacksLib: tmpLib("callbacks"),
  };

  beforeAll(async () => {
    await Promise.all([
      compileC(fixturePath("math.c"), libs.mathLib),
      compileC(fixturePath("callbacks.c"), libs.callbacksLib),
    ]);
  });

  afterAll(() => {
    for (const path of [libs.mathLib, libs.callbacksLib]) {
      try {
        Bun.file(path)
          .exists()
          .then((exists) => {
            if (exists) {
              const { unlinkSync } = require("node:fs") as typeof import("node:fs");
              unlinkSync(path);
            }
          });
      } catch {
        // best-effort cleanup
      }
    }
  });

  return libs;
}
