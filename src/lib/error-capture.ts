// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.
//
// Workers isolates are shared across requests, so this module deliberately:
//  - keeps only a sanitized snapshot (name/message/stack), never the original object, so no
//    request/response/closure graph is retained by the module-level slot;
//  - keeps a single short-lived slot that is cleared on read or after TTL_MS, so an error from
//    one request is not attributed to (or held across) later ones;
//  - registers its global listeners once, even if the module is evaluated more than once.

type Snapshot = { name: string; message: string; stack?: string };

let lastCapturedError: { snapshot: Snapshot; at: number } | undefined;
const TTL_MS = 2_000;
const MAX_FIELD_LENGTH = 8_000;

function clip(value: unknown): string {
  const text = typeof value === "string" ? value : String(value);
  return text.length > MAX_FIELD_LENGTH ? `${text.slice(0, MAX_FIELD_LENGTH)}…` : text;
}

function snapshotOf(error: unknown): Snapshot {
  if (error instanceof Error) {
    return {
      name: clip(error.name),
      message: clip(error.message),
      stack: error.stack ? clip(error.stack) : undefined,
    };
  }
  return { name: "NonErrorThrow", message: clip(error) };
}

function record(error: unknown) {
  lastCapturedError = { snapshot: snapshotOf(error), at: Date.now() };
}

const REGISTERED = Symbol.for("investiq.error-capture.registered");
const globalScope = globalThis as typeof globalThis & { [REGISTERED]?: true };

if (typeof globalScope.addEventListener === "function" && !globalScope[REGISTERED]) {
  globalScope[REGISTERED] = true;
  globalScope.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalScope.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

/** Returns (and clears) a fresh Error rebuilt from the last captured snapshot, if still recent. */
export function consumeLastCapturedError(): Error | undefined {
  if (!lastCapturedError) return undefined;
  const { snapshot, at } = lastCapturedError;
  lastCapturedError = undefined;
  if (Date.now() - at > TTL_MS) return undefined;

  const error = new Error(snapshot.message);
  error.name = snapshot.name;
  if (snapshot.stack) error.stack = snapshot.stack;
  return error;
}
