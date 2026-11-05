import { useEffect, useRef, useState } from "react";
import { gaugeBand, gaugeMetrics, type DashboardSummary, type GaugeBand, type GaugeMetric } from "@regdash/shared";
import { isSelected } from "./SummaryCards";

const CX = 100;
const CY = 88;
const START_DEG = -120;
const SWEEP_DEG = 240;
const SEGMENTS = 30;
const SWEEP_MS = 1100;
const STAGGER_MS = 70;

const BAND_LABEL: Record<GaugeBand, { text: string; icon: string }> = {
  OK: { text: "OK", icon: "✓" },
  WATCH: { text: "Watch", icon: "!" },
  HIGH: { text: "High", icon: "▲" },
};

const angleFor = (percent: number) => START_DEG + (percent / 100) * SWEEP_DEG;

/** Point on the dial, with 0° straight up and angles running clockwise. */
function polar(deg: number, radius: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** Runs slightly past the end and settles back, like a real needle. */
const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

/**
 * Animates towards `target`. A new `sweepKey` restarts from zero; a new target alone
 * (e.g. a ticket going stale between refreshes) just moves from where it is.
 */
function useSweep(target: number, sweepKey: unknown, delayMs: number) {
  const [pos, setPos] = useState({ value: 0, needle: 0 });
  const current = useRef(0);
  const lastKey = useRef(sweepKey);

  useEffect(() => {
    const restart = lastKey.current !== sweepKey;
    lastKey.current = sweepKey;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = target;
      setPos({ value: target, needle: target });
      return;
    }

    const from = restart ? 0 : current.current;
    const delay = restart || from === 0 ? delayMs : 0;
    let frame = 0;
    let startedAt: number | null = null;
    const tick = (time: number) => {
      startedAt ??= time;
      const t = Math.min(1, Math.max(0, time - startedAt - delay) / SWEEP_MS);
      const value = from + (target - from) * easeOutCubic(t);
      current.current = value;
      setPos({ value, needle: from + (target - from) * easeOutBack(t) });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, sweepKey, delayMs]);

  return pos;
}

function Dial({ metric, value, needle }: { metric: GaugeMetric; value: number; needle: number }) {
  const hasData = metric.percent !== null;
  const scaleY = polar(START_DEG, 76).y + 15;

  return (
    <svg className="gauge-dial" viewBox="0 0 200 142" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const mid = ((i + 0.5) / SEGMENTS) * 100;
        const deg = angleFor(mid);
        // The ramp: each bar reaches a little further out than the one before.
        const from = polar(deg, 60);
        const to = polar(deg, 70 + (i / (SEGMENTS - 1)) * 10);
        const band = hasData ? gaugeBand(mid, metric).toLowerCase() : null;
        const lit = hasData && value >= mid;
        return (
          <line
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className={band ? `gauge-seg gauge-seg-${band}${lit ? " lit" : ""}` : "gauge-seg gauge-seg-none"}
          />
        );
      })}
      <text x={polar(START_DEG, 66).x} y={scaleY} className="gauge-scale" textAnchor="middle">0</text>
      <text x={polar(START_DEG + SWEEP_DEG, 66).x} y={scaleY} className="gauge-scale" textAnchor="middle">100</text>
      <g className="gauge-needle" transform={`rotate(${angleFor(Math.min(100, Math.max(0, needle))).toFixed(2)} ${CX} ${CY})`}>
        <polygon points={`${CX - 3},${CY} ${CX + 3},${CY} ${CX},${CY - 54}`} />
      </g>
      <circle className="gauge-hub" cx={CX} cy={CY} r={7} />
      <text x={CX} y={CY + 42} className="gauge-value" textAnchor="middle">
        {hasData ? `${Math.round(value)}%` : "—"}
      </text>
    </svg>
  );
}

function Gauge({ metric, index, sweepKey, selected, onPick }: {
  metric: GaugeMetric;
  index: number;
  sweepKey: unknown;
  selected: boolean;
  onPick: (filter: Record<string, string>) => void;
}) {
  const { value, needle } = useSweep(metric.percent ?? 0, sweepKey, index * STAGGER_MS);
  const band = metric.band && BAND_LABEL[metric.band];
  const detail = `${metric.count} of ${metric.total} ${metric.totalLabel}`;

  return (
    <button
      className={`card gauge ${selected ? "card-selected" : ""}`}
      onClick={() => onPick(metric.filter)}
      title={`${metric.hint}. Watch from ${metric.watchAt}%, high from ${metric.highAt}%.`}
      aria-pressed={selected}
      aria-label={
        metric.percent === null
          ? `${metric.label}: no tickets to measure`
          : `${metric.label}: ${metric.percent}%, ${band!.text}. ${detail}.`
      }
    >
      <Dial metric={metric} value={value} needle={needle} />
      <span className="gauge-text">
        <span className="card-label">{metric.label}</span>
        <span className="gauge-detail">{metric.percent === null ? "Nothing to measure" : detail}</span>
        {band && (
          <span className="gauge-band">
            <span className={`gauge-icon gauge-icon-${metric.band!.toLowerCase()}`} aria-hidden>{band.icon}</span>
            {band.text}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Speedometers for the share of open work that needs attention. The needles sweep up
 * from zero whenever the API has pulled new data, which covers the Refresh button, its
 * timed re-pull, an API restart and a file upload. A failed refresh doesn't sweep, so
 * movement never suggests data is fresher than it is.
 */
export function Gauges({ summary, params, onPick }: {
  summary: DashboardSummary;
  params: URLSearchParams;
  onPick: (filter: Record<string, string>) => void;
}) {
  return (
    <section className="gauges" aria-label="Attention gauges">
      {gaugeMetrics(summary).map((m, i) => (
        <Gauge
          key={m.key}
          metric={m}
          index={i}
          sweepKey={summary.lastRefreshedAt}
          selected={isSelected(m.filter, params)}
          onPick={onPick}
        />
      ))}
    </section>
  );
}
