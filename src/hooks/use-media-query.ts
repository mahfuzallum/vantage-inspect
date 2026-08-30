"use client";

import { useEffect, useState } from "react";

/**
 * Subscribes to a media query. Starts false so server and first client
 * render agree, then corrects after mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);

    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener("change", handleChange);
    return () => list.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
