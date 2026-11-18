
"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { formatRateTick } from "@/lib/rates/formatting";
import {
  createRateHistoryLoader,
  type RateHistoryLoader,
} from "@/lib/rates/rateHistoryRequests";
import {
  describeDataAge,
  initialRateHistoryPanelState,
  rateHistoryPanelReducer,
} from "@/lib/rates/rateHistoryPanelState";
import type {
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";

type Props = Readonly<{
  corridorSlug: string;
  initialHistory: PublicRateHistoryResponse;
}>;

const TIMEFRAME_OPTIONS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
] as const;

const SVG_WIDTH = 800;
const SVG_HEIGHT = 280;
const PADDING = { top: 25, right: 30, bottom: 45, left: 65 };
const CHART_WIDTH = SVG_WIDTH - PADDING.left - PADDING.right;
const CHART_HEIGHT = SVG_HEIGHT - PADDING.top - PADDING.bottom;
const GAP_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export function CorridorRateHistoryChart({
  corridorSlug,
  initialHistory,
}: Props) {
  const chartId = useId();
  const [panel, dispatch] = useReducer(
    rateHistoryPanelReducer,
    initialHistory,
    initialRateHistoryPanelState,
  );

  // `history` is always the latest successful response; a failed refresh retains it.
  const { displayed: history, selectedDays, loading, failure } = panel;
  const displayedDays = history.windowDays;
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const loaderRef = useRef<RateHistoryLoader | null>(null);

  useEffect(() => {
    const loader = createRateHistoryLoader({
      corridorSlug,
      callbacks: {
        onSuccess: (data) => {
          dispatch({ type: "refresh_succeeded", history: data });
        },
        onError: (message, days) => {
          dispatch({
            type: "refresh_failed",
            message,
            days,
            failedAt: new Date().toISOString(),
          });
        },
      },
    });

    loaderRef.current = loader;

    return () => {
      loader.dispose();

      if (loaderRef.current === loader) {
        loaderRef.current = null;
      }
    };
  }, [corridorSlug]);

  function handleTimeframeChange(days: number) {
    if (days === selectedDays) return;

    dispatch({ type: "refresh_started", days });
    setHoveredPointIndex(null);

    // The loader aborts in-flight requests so only the latest selection can update the chart.
    void loaderRef.current?.load(days);
  }

  const validPoints = history.points
    .map((point, index) => {
      const rateNum =
        point.medianRate !== null
          ? Number.parseFloat(point.medianRate)
          : null;
      const timeNum = new Date(point.timestamp).getTime();

      return {
        point,
        originalIndex: index,
        rate: rateNum,
        time: timeNum,
      };
    })
    .filter(
      (
        item,
      ): item is {
        point: PublicRateHistoryPoint;
        originalIndex: number;
        rate: number;
        time: number;
      } =>
        item.rate !== null &&
        Number.isFinite(item.rate) &&
        Number.isFinite(item.time),
    );

  const evaluatedAtTime = new Date(history.evaluatedAt).getTime();
  const minWindowTime =
    evaluatedAtTime - displayedDays * 24 * 60 * 60 * 1000;

  const minTime =
    validPoints.length > 0
      ? Math.min(minWindowTime, validPoints[0]!.time)
      : minWindowTime;

  const maxTime = Math.max(
    evaluatedAtTime,
    validPoints.length > 0
      ? validPoints[validPoints.length - 1]!.time
      : minWindowTime + 1,
  );

  const timeSpan = Math.max(maxTime - minTime, 1);

  const rates = validPoints.map((point) => point.rate);
  const minRate = rates.length > 0 ? Math.min(...rates) : 0;
  const maxRate = rates.length > 0 ? Math.max(...rates) : 1;
  const ratePadding =
    (maxRate - minRate) * 0.1 ||
    (minRate > 0 ? minRate * 0.05 : 0.01);

  const yMin = Math.max(0, minRate - ratePadding);
  const yMax = maxRate + ratePadding;
  const rateSpan = Math.max(yMax - yMin, 0.000001);

  function getX(time: number): number {
    return PADDING.left + ((time - minTime) / timeSpan) * CHART_WIDTH;
  }

  function getY(rate: number): number {
    return (
      PADDING.top +
      (1 - (rate - yMin) / rateSpan) * CHART_HEIGHT
    );
  }

  // Segment creation respects gaps between observations.
  const segments: Array<
    Array<{ x: number; y: number; originalIndex: number }>
  > = [];

  let currentSegment: Array<{
    x: number;
    y: number;
    originalIndex: number;
  }> = [];

  for (let i = 0; i < validPoints.length; i++) {
    const point = validPoints[i]!;
    const previous = validPoints[i - 1];

    if (
      previous &&
      point.time - previous.time > GAP_THRESHOLD_MS
    ) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }

    currentSegment.push({
      x: getX(point.time),
      y: getY(point.rate),
      originalIndex: point.originalIndex,
    });
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  const activePoint =
    hoveredPointIndex !== null && history.points[hoveredPointIndex]
      ? history.points[hoveredPointIndex]
      : null;

  const yTicks = [
    { value: yMax, label: formatRateTick(yMax) },
    {
      value: (yMin + yMax) / 2,
      label: formatRateTick((yMin + yMax) / 2),
    },
    { value: yMin, label: formatRateTick(yMin) },
  ];

  const xTicks = [
    {
      time: minTime,
      label: new Date(minTime).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    },
    {
      time: minTime + timeSpan / 2,
      label: new Date(minTime + timeSpan / 2).toLocaleDateString(
        undefined,
        {
          month: "short",
          day: "numeric",
        },
      ),
    },
    {
      time: maxTime,
      label: new Date(maxTime).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    },
  ];

  return (
    <section
      aria-labelledby="rate-history-heading"
      className="mt-10"
      data-testid="corridor-rate-history-section"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Rate timeline</p>
          <h2
            id="rate-history-heading"
            className="mt-2 text-2xl"
            style={{ fontFamily: "var(--display)" }}
          >
            Historical rate chart
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="sr-only">Select history window:</span>
          <div
            role="group"
            aria-label="Timeframe selection"
            className="inline-flex rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-1 text-xs"
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => handleTimeframeChange(option.days)}
                aria-pressed={selectedDays === option.days}
                className={`rounded px-3 py-1 font-medium transition-colors ${
                  selectedDays === option.days
                    ? "bg-[var(--ghost)] text-[var(--white)]"
                    : "text-[var(--muted)] hover:text-[var(--white)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        aria-busy={loading}
        className="mt-5 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ghost)] pb-4 text-xs text-[var(--muted)]">
          <div className="flex items-center gap-4">
            <span>
              <strong className="font-medium text-[var(--white)]">
                {history.points.length}
              </strong>{" "}
              {history.points.length === 1 ? "snapshot" : "snapshots"}
            </span>

            <span>
              <strong className="font-medium text-[var(--white)]">
                {validPoints.length}
              </strong>{" "}
              median {validPoints.length === 1 ? "point" : "points"}
            </span>

            <span className="rounded bg-[var(--ghost)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
              Gaps preserved honestly
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span data-testid="rate-history-displayed-window">
              Showing {displayedDays}-day window · evaluated{" "}
              <time dateTime={history.evaluatedAt}>
                {new Date(history.evaluatedAt).toLocaleString()}
              </time>
            </span>

            {loading ? (
              <span className="text-[var(--muted)]">
                Loading {selectedDays}-day window...
              </span>
            ) : null}
          </div>
        </div>

        {failure ? (
          <div
            role="alert"
            data-testid="rate-history-refresh-failure"
            className="mt-4 rounded border border-[rgba(238,143,129,0.35)] p-4 text-sm text-[#ee8f81]"
          >
            <p>
              Could not refresh the {failure.requestedDays}-day history:{" "}
              {failure.message}
            </p>

            <p className="mt-1 text-xs">
              Still showing the last successful {displayedDays}-day
              history, evaluated{" "}
              {new Date(history.evaluatedAt).toLocaleString()} (
              {describeDataAge(
                history.evaluatedAt,
                new Date(failure.failedAt),
              )}{" "}
              when the refresh failed). Select a window to try again.
            </p>
          </div>
        ) : null}

        {validPoints.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--muted)]">
            <p>
              No historical rate snapshots recorded for the {displayedDays}-day
              window.
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Rates are plotted only when independent anchors quote on this
              corridor.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <figure className="relative">
              <svg
                aria-label={`Historical rate chart for ${corridorSlug} over the past ${displayedDays} days`}
                role="img"
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="h-auto w-full overflow-visible select-none"
              >
                <defs>
                  <linearGradient
                    id={`${chartId}-area-grad`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--accent)"
                      stopOpacity="0.18"
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--accent)"
                      stopOpacity="0.0"
                    />
                  </linearGradient>
                </defs>

                {/* Horizontal grid lines and Y ticks */}
                {yTicks.map((tick, index) => {
                  const y = getY(tick.value);

                  return (
                    <g key={index}>
                      <line
                        x1={PADDING.left}
                        y1={y}
                        x2={SVG_WIDTH - PADDING.right}
                        y2={y}
                        stroke="var(--ghost)"
                        strokeDasharray="4,4"
                      />

                      <text
                        x={PADDING.left - 10}
                        y={y + 4}
                        textAnchor="end"
                        fill="var(--muted)"
                        fontSize="11"
                        fontFamily="var(--sans)"
                      >
                        {tick.label}
                      </text>
                    </g>
                  );
                })}

                {/* X ticks and vertical guides */}
                {xTicks.map((tick, index) => {
                  const x = getX(tick.time);

                  return (
                    <g key={index}>
                      <line
                        x1={x}
                        y1={PADDING.top}
                        x2={x}
                        y2={SVG_HEIGHT - PADDING.bottom}
                        stroke="var(--ghost)"
                        strokeDasharray="2,4"
                      />

                      <text
                        x={x}
                        y={SVG_HEIGHT - PADDING.bottom + 20}
                        textAnchor="middle"
                        fill="var(--muted)"
                        fontSize="11"
                        fontFamily="var(--sans)"
                      >
                        {tick.label}
                      </text>
                    </g>
                  );
                })}

                {/* Line segments and area under each line */}
                {segments.map((segment, segmentIndex) => {
                  if (segment.length === 0) return null;

                  const lineD = segment.reduce(
                    (accumulator, point, index) =>
                      `${accumulator} ${
                        index === 0 ? "M" : "L"
                      } ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
                    "",
                  );

                  const firstPoint = segment[0]!;
                  const lastPoint = segment[segment.length - 1]!;
                  const bottomY = PADDING.top + CHART_HEIGHT;

                  const areaD = `${lineD} L ${lastPoint.x.toFixed(
                    2,
                  )} ${bottomY} L ${firstPoint.x.toFixed(2)} ${bottomY} Z`;

                  return (
                    <g key={segmentIndex}>
                      <path
                        d={areaD}
                        fill={`url(#${chartId}-area-grad)`}
                        pointerEvents="none"
                      />

                      <path
                        d={lineD}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                })}

                {/* Point markers and hover target zones */}
                {validPoints.map((point, index) => {
                  const cx = getX(point.time);
                  const cy = getY(point.rate);
                  const isHovered =
                    hoveredPointIndex === point.originalIndex;

                  return (
                    <g key={index}>
                      {/* Invisible larger target for easier interaction */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r="12"
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() =>
                          setHoveredPointIndex(point.originalIndex)
                        }
                        onMouseLeave={() => setHoveredPointIndex(null)}
                        onFocus={() =>
                          setHoveredPointIndex(point.originalIndex)
                        }
                        onBlur={() => setHoveredPointIndex(null)}
                        tabIndex={0}
                        aria-label={`Snapshot on ${new Date(
                          point.time,
                        ).toLocaleString()}: median rate ${
                          point.point.medianRate
                        }`}
                      />

                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : 3.5}
                        fill={
                          isHovered ? "var(--white)" : "var(--accent)"
                        }
                        stroke="var(--black)"
                        strokeWidth="2"
                        className="pointer-events-none transition-all duration-150"
                      />
                    </g>
                  );
                })}
              </svg>

              <figcaption className="sr-only">
                Chart showing {validPoints.length} median rate snapshots for{" "}
                {corridorSlug} over {displayedDays} days.
              </figcaption>
            </figure>

            {/* Active inspection tooltip / card */}
            <div
              className={`mt-4 rounded-md border p-4 transition-colors ${
                activePoint
                  ? "border-[var(--accent)] bg-[var(--surface)]"
                  : "border-[var(--ghost)] bg-[rgba(255,255,255,0.02)]"
              }`}
            >
              {activePoint ? (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ghost)] pb-2 text-xs">
                    <span className="font-medium text-[var(--white)]">
                      {new Date(activePoint.timestamp).toLocaleString()}
                    </span>

                    <span
                      className="rounded px-2 py-0.5 text-[11px] uppercase tracking-wide"
                      style={{
                        backgroundColor:
                          activePoint.state === "healthy"
                            ? "rgba(21, 221, 128, 0.15)"
                            : "var(--ghost)",
                        color:
                          activePoint.state === "healthy"
                            ? "var(--accent)"
                            : "var(--muted)",
                      }}
                    >
                      {activePoint.state === "healthy"
                        ? "Healthy Median"
                        : "Insufficient Fresh Sources"}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        Median Rate
                      </p>
                      <p
                        className="text-lg font-medium text-[var(--white)]"
                        style={{ fontFamily: "var(--display)" }}
                      >
                        {activePoint.medianRate ?? "Unavailable"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        Sources
                      </p>
                      <p className="text-sm text-[var(--white)]">
                        {activePoint.freshSourceCount} fresh (
                        {activePoint.sourceCount} total)
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        Observations
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {activePoint.observations
                          .map((observation) =>
                            `${observation.anchor.name} (${observation.rate})`,
                          )
                          .join(", ")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-1 text-center text-xs text-[var(--muted)]">
                  Hover or focus on any rate point in the timeline to inspect
                  detailed snapshot observations.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
