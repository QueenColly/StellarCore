import type { RateEngineFailure } from "@/types/rates";

export type ScheduledRateFailure = RateEngineFailure | Readonly<{
  phase: "PREPARATION";
  code: "LIVE_RATE_PREPARATION_FAILURE";
}>;

export type ScheduledReputationFailure = Readonly<{
  anchorSlug: string;
  code: string;
}>;

export type ScheduledRefreshResult = Readonly<{
  ok: boolean;
  runId: string;
  startedAt: string;
  completedAt: string;
  attempt: number;
  rates: Readonly<{
    attempted: number;
    succeeded: number;
    failed: number;
    skipped: number;
    suppressed?: number;
    failures: readonly ScheduledRateFailure[];
  }>;
  reputation: Readonly<{
    attempted: number;
    succeeded: number;
    failed: number;
    failures: readonly ScheduledReputationFailure[];
  }>;
}>;
