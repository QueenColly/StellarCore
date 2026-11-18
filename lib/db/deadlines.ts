export class DatabaseDeadlineExceededError extends Error {
  readonly code = "DATABASE_DEADLINE_EXCEEDED";
  readonly timeoutMs?: number;

  constructor(message = "Database operation exceeded deadline", timeoutMs?: number) {
    super(message);
    this.name = "DatabaseDeadlineExceededError";
    this.timeoutMs = timeoutMs;
  }
}

export type DatabaseDeadlineOptions = Readonly<{
  timeoutMs?: number;
  signal?: AbortSignal;
}>;

/**
 * Runs an asynchronous database operation bounded by a timeout and/or an AbortSignal.
 * If the deadline is exceeded before the operation completes, rejects with DatabaseDeadlineExceededError.
 */
export async function withDatabaseDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: DatabaseDeadlineOptions = {},
): Promise<T> {
  const { timeoutMs, signal: parentSignal } = options;

  if (parentSignal?.aborted) {
    throw new DatabaseDeadlineExceededError("Database operation aborted by signal");
  }

  const controller = new AbortController();
  let timerId: NodeJS.Timeout | undefined;
  let didTimeout = false;

  const onParentAbort = () => {
    controller.abort(parentSignal?.reason);
  };

  if (parentSignal) {
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    if (typeof timeoutMs === "number" && timeoutMs > 0) {
      timerId = setTimeout(() => {
        didTimeout = true;
        controller.abort(new DatabaseDeadlineExceededError(
          `Database operation exceeded deadline of ${timeoutMs}ms`,
          timeoutMs,
        ));
        reject(
          new DatabaseDeadlineExceededError(
            `Database operation exceeded deadline of ${timeoutMs}ms`,
            timeoutMs,
          ),
        );
      }, timeoutMs);

      if (timerId.unref) {
        timerId.unref();
      }
    }
  });

  const abortPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => {
      if (!didTimeout) {
        reject(
          new DatabaseDeadlineExceededError("Database operation aborted by signal"),
        );
      }
    }, { once: true });
  });

  try {
    return await Promise.race([
      operation(controller.signal),
      timeoutPromise,
      abortPromise,
    ]);
  } finally {
    if (timerId) {
      clearTimeout(timerId);
    }
    if (parentSignal) {
      parentSignal.removeEventListener("abort", onParentAbort);
    }
  }
}
