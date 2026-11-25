import type { PublicRatesResponse } from "@/types/api/rates";

export const RATES_REQUEST_TIMEOUT_MS = 10_000;

const DEFAULT_ERROR_MESSAGE = "Unable to load current rates.";
const TIMEOUT_ERROR_MESSAGE = "Current rates request timed out.";
const MISMATCH_ERROR_MESSAGE = "Current rates response did not match the requested corridor.";

type FetchLike = (input: string, init: { signal: AbortSignal }) => Promise<Response>;

export type RatesLoaderCallbacks = Readonly<{
  onSuccess: (rates: PublicRatesResponse) => void;
  onError: (message: string) => void;
}>;

export type RatesLoaderOptions = Readonly<{
  corridorSlug: string;
  callbacks: RatesLoaderCallbacks;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}>;

export type RatesLoader = Readonly<{
  load: () => Promise<void>;
  dispose: () => void;
}>;

export function createRatesLoader(options: RatesLoaderOptions): RatesLoader {
  const {
    corridorSlug,
    callbacks,
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = RATES_REQUEST_TIMEOUT_MS,
    setTimer = (callback, ms) => setTimeout(callback, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  } = options;

  let sequence = 0;
  let activeController: AbortController | null = null;
  let disposed = false;

  async function load(): Promise<void> {
    if (disposed) return;

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const requestId = ++sequence;
    const isCurrent = () => !disposed && requestId === sequence;

    let timedOut = false;
    const timer = setTimer(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(
        `/api/rates?corridor=${encodeURIComponent(corridorSlug)}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message ?? DEFAULT_ERROR_MESSAGE);
      }
      const data = (await response.json()) as PublicRatesResponse;
      if (!isCurrent()) return;
      if (data?.corridor?.slug !== corridorSlug || !Array.isArray(data.observations)) {
        throw new Error(MISMATCH_ERROR_MESSAGE);
      }
      callbacks.onSuccess(data);
    } catch (err) {
      if (!isCurrent()) return;
      if (timedOut) {
        callbacks.onError(TIMEOUT_ERROR_MESSAGE);
        return;
      }
      callbacks.onError(err instanceof Error && err.message ? err.message : DEFAULT_ERROR_MESSAGE);
    } finally {
      clearTimer(timer);
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  function dispose() {
    disposed = true;
    activeController?.abort();
    activeController = null;
  }

  return { load, dispose };
}