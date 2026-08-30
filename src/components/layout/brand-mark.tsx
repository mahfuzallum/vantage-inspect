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

/** Taps needed, and how long the run may take before it resets. */
const TAPS_REQUIRED = 5;
const TAP_WINDOW_MS = 2000;

/**
 * The site wordmark, with a hidden way into the administration area.
 *
 * Five deliberate taps inside two seconds opens a code prompt. The window
 * matters: without it, five ordinary clicks on the logo spread over a browsing
 * session would eventually open the prompt for a visitor who never asked for
 * it.
 *
 * The link still works — a single click navigates home as it always did, and
 * nothing about the markup hints the shortcut exists. The code is checked on
 * the server, so it is not in the bundle and cannot be read out of it.
 */
export function BrandMark({ label }: { label: string }) {
  const [taps, setTaps] = useState(0);
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(unlockAdminAction, initialAuthState);
  const firstTapAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes it, the way any transient overlay should.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function handleClick(event: React.MouseEvent) {
    const now = Date.now();
    const withinRun = now - firstTapAt.current < TAP_WINDOW_MS;
    const next = withinRun ? taps + 1 : 1;

    if (!withinRun) firstTapAt.current = now;
    setTaps(next);

    // Only the final tap is swallowed; earlier ones navigate normally, so a
    // visitor clicking the logo to go home is never blocked.
    if (next >= TAPS_REQUIRED) {
      event.preventDefault();
      setTaps(0);
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
            <KeyRound className="size-3.5 text-accent" aria-hidden="true" />
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
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Go"}
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
