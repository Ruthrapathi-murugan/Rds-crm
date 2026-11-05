"use client";

import { useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

/**
 * Charts follow one system: a single hue for single-measure charts, thin bars
 * with 4px rounded data ends, recessive grid and axes, hover tooltips, and
 * text in ink colours (never the series colour).
 */

const inrCompact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
const inrFull = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN");

export type ValueFormat = "inr" | "number" | "percent";

function fmt(value: number, format: ValueFormat, compact = false) {
  if (format === "inr") return (compact ? inrCompact : inrFull).format(value / 100);
  if (format === "percent") return `${value.toFixed(1)}%`;
  return num.format(value);
}

// Recharts measures the DOM; render only after hydration to avoid a size-0 flash.
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
  seriesLabel,
}: TooltipContentProps<number, string> & {
  format: ValueFormat;
  seriesLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload as Record<string, unknown>;
  // Optional per-datum detail line, computed by the caller (functions cannot cross to the client).
  const note = typeof datum.note === "string" ? datum.note : null;
  return (
    <div className="bg-popover text-popover-foreground animate-fade-in rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{String(datum.label ?? label)}</p>
      <p className="flex items-center gap-2">
        <span className="size-2 rounded-sm" style={{ background: "var(--chart-1)" }} aria-hidden="true" />
        <span className="text-muted-foreground">{seriesLabel}</span>
        <span className="ml-auto font-semibold tabular-nums">{fmt(Number(payload[0].value ?? 0), format)}</span>
      </p>
      {note && <p className="text-muted-foreground mt-1">{note}</p>}
    </div>
  );
}

/** Vertical bars over time (e.g. monthly revenue). */
export function ColumnChart({
  data,
  format = "inr",
  seriesLabel,
  height = 280,
}: {
  data: { label: string; value: number; note?: string; [key: string]: unknown }[];
  format?: ValueFormat;
  seriesLabel: string;
  height?: number;
}) {
  const mounted = useMounted();
  if (!mounted) return <div style={{ height }} className="shimmer rounded-lg" aria-hidden="true" />;
  return (
    <div style={{ height }} className="animate-fade-in" role="img" aria-label={`${seriesLabel} chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="0" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
            tickFormatter={(v: number) => fmt(v, format, true)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} format={format} seriesLabel={seriesLabel} />}
          />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars for categories (sources, services, statuses). */
export function BarList({
  data,
  format = "number",
  seriesLabel,
  colors,
}: {
  data: { label: string; value: number; note?: string; [key: string]: unknown }[];
  format?: ValueFormat;
  seriesLabel: string;
  /** Optional per-bar colours (ordinal ramps); defaults to a single hue. */
  colors?: string[];
}) {
  const mounted = useMounted();
  const height = Math.max(120, data.length * 34 + 16);
  if (!mounted) return <div style={{ height }} className="shimmer rounded-lg" aria-hidden="true" />;
  return (
    <div style={{ height }} className="animate-fade-in" role="img" aria-label={`${seriesLabel} chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap="22%">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} format={format} seriesLabel={seriesLabel} />}
          />
          <Bar
            dataKey="value"
            fill="var(--chart-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            isAnimationActive={false}
            label={{ position: "right", fill: "var(--muted-foreground)", fontSize: 11, formatter: (v: unknown) => fmt(Number(v), format, true) }}
          >
            {colors && data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ordinal blue ramp (light → dark) for ordered stages such as the lead funnel. */
export const ORDINAL_BLUE = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab"];
