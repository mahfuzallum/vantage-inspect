"use client";

import { useEffect, useRef, useState } from "react";
import { formatCount } from "@/lib/utils/format";

/**
 * A figure that counts up to its value when it first comes into view.
 *
 * Starts from the final number, not from zero: if the animation never runs —
 * JavaScript disabled, reduced motion, an old browser without
 * IntersectionObserver — the reader still sees the correct figure rather than
 * a permanent zero. The animation is an enhancement, never the source of the
 * value.
 */
export function CountUp({
  value,
  durationMs = 1400,
  className,
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || hasRun.current) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || hasRun.current) return;
        hasRun.current = true;
        observer.disconnect();

        const start = performance.now();
        setDisplay(0);

        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          // Ease-out cubic: fast at first, settling into the final number.
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(value * eased));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {formatCount(display)}
    </span>
  );
}
