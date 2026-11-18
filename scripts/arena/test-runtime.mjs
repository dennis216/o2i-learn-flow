import { createArenaTestApi } from "../../public/games/limit-arena.js";

const runtimes = new WeakMap();

// Fixtures patch explicit bindings, never compile a substring of the shipped code.
export function installArenaRuntime(context) {
  if (runtimes.has(context)) return context;
  const runtime = createArenaTestApi({ ...context });
  runtimes.set(context, runtime);
  for (const key of Object.keys(runtime.bindings)) {
    Object.defineProperty(context, key, {
      configurable: true,
      enumerable: true,
      get: () => runtime.bindings[key],
      set: (value) => {
        runtime.bindings[key] = value;
      },
    });
  }
  return context;
}

export function arenaContext(overrides = {}) {
  return installArenaRuntime({ ...overrides });
}

export function originalArenaBinding(context, name) {
  installArenaRuntime(context);
  return runtimes.get(context).originals[name];
}
