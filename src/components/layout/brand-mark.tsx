"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, Star, X } from "lucide-react";
import { unlockAdminAction } from "@/server/actions/auth";
import { initialAuthState } from "@/server/actions/auth-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

const TAPS_REQUIRED = 5;
const TAP_WINDOW_MS = 2000;

export function BrandMark({ label }: { label: string }) {
  const [taps, setTaps] = useState(0);
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    unlockAdminAction,
    initialAuthState,
  );
  const firstTapAt = useRef(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    // Always prevent the Link from navigating while we count the taps.
    // The old implementation only prevented the fifth click, which caused
    // the page to navigate/re-render before five taps could be registered.
    event.preventDefault();

    const now = Date.now();
    const withinRun =
      firstTapAt.current > 0 &&
      now - firstTapAt.current < TAP_WINDOW_MS;

    const next = withinRun ? taps + 1 : 1;

    if (!withinRun) {
      firstTapAt.current = now;
    }

    setTaps(next);

    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }

    resetTimer.current = setTimeout(() => {
      setTaps(0);
      firstTapAt.current = 0;
    }, TAP_WINDOW_MS);

    if (next >= TAPS_REQUIRED) {
      setTaps(0);
      firstTapAt.current = 0;

      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }

      setOpen(true);
    }
  }

  return (
    <div className="relative shrink-0">
      <Link
        href={routes.home}
        onClick={handleClick}
        className="flex items-center gap-2"
        aria-label={`${label} — home`}
      >
        <span className="font-display text-base font-extrabold uppercase tracking-tight text-white">
          {label}
        </span>

        <Star
          className="size-3.5 shrink-0 fill-[var(--color-gold)] text-[var(--color-gold)]"
          aria-hidden="true"
        />
      </Link>

      {open ? (
        <div
          role="dialog"
          aria-label="Administrator access"
          className={cn(
            "absolute left-0 top-full z-50 mt-2 w-72 rounded-card border border-line",
            "bg-surface p-3 shadow-raised",
          )}
        >
          <div className="mb-2 flex items-center gap-2">
            <KeyRound
              className="size-3.5 text-accent"
              aria-hidden="true"
            />

            <span className="slate flex-1">Access code</span>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-control p-1 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <form action={action} className="flex gap-2">
            <Input
              ref={inputRef}
              name="code"
              type="password"
              autoComplete="off"
              placeholder="Enter code"
              aria-invalid={state.status === "error"}
              className="h-9 flex-1"
            />

            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <Loader2
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                "Go"
              )}
            </Button>
          </form>

          {state.status === "error" && state.formError ? (
            <p role="alert" className="mt-2 text-sm text-critical">
              {state.formError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}