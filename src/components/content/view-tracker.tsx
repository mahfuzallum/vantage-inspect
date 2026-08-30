"use client";

import { useCallback, useRef } from "react";
import { recordContentView } from "@/server/actions/views";

/**
 * Returns a callback that records a view exactly once per page lifecycle.
 *
 * The ref guard is the important part: React can re-render or re-mount a
 * component many times for one visit, and effects run twice in development
 * Strict Mode. Counting on each of those would make the number meaningless.
 * The server de-duplicates again per viewer over 30 minutes.
 */
export function useViewTracker(contentId: string) {
  const recorded = useRef(false);

  return useCallback(() => {
    if (recorded.current) return;
    recorded.current = true;
    // Fire and forget — the page must not wait on, or fail with, tracking.
    void recordContentView(contentId);
  }, [contentId]);
}
