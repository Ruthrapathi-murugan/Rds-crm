"use client";

import { useEffect, useRef } from "react";

/**
 * Animates a number from zero on first render. The final, formatted value is
 * rendered on the server, so it is correct without JavaScript and for
 * screen readers; the animation only rewrites the visible text.
 */
export function CountUp({
  value,
  format,
  duration = 900,
  className,
}: {
  value: number;
  format: "number" | "inr" | "inr-compact" | "percent";
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = formatValue(value, format);

  useEffect(() => {
    const node = ref.current;
    if (!node || value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = formatValue(value * eased, format);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else node.textContent = formatValue(value, format);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, format, duration]);

  return (
    <span ref={ref} className={className}>
      {finalText}
    </span>
  );
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** `value` is paise for the INR formats. */
function formatValue(value: number, format: "number" | "inr" | "inr-compact" | "percent") {
  switch (format) {
    case "inr":
      return inr.format(Math.round(value) / 100);
    case "inr-compact":
      return inrCompact.format(Math.round(value) / 100);
    case "percent":
      return `${value.toFixed(1)}%`;
    default:
      return num.format(Math.round(value));
  }
}
