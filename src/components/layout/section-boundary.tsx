"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Isolates one section of a page.
 *
 * The home page is a stack of independent shelves. Without this, a single bad
 * record in any one of them throws during render and React unmounts the whole
 * route — the reader gets an error card instead of the eight sections that
 * were perfectly fine. Here the failed section renders as nothing (or as
 * `fallback`) and everything around it survives.
 *
 * Deliberately silent in the interface: a visitor cannot act on "the trending
 * rail failed", so they are shown one less shelf rather than an apology. The
 * error still reaches the console for whoever is running the server.
 *
 * A class component because React has no hook equivalent — `componentDidCatch`
 * has no functional counterpart.
 */
export class SectionBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; label?: string },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[section:${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  override render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
