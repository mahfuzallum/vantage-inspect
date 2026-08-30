"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toggleFavoriteAction } from "@/server/actions/favorites";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { loginWithCallback } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

export type FavoriteButtonProps = {
  contentId: string;
  /** Server-resolved starting state; the button never guesses. */
  initialSaved: boolean;
  isSignedIn: boolean;
  /** Where to return after signing in. */
  returnTo: string;
  className?: string;
};

/**
 * Save toggle.
 *
 * A signed-out reader gets an explicit prompt rather than a button that
 * quietly does nothing. The optimistic flip is reverted if the server rejects
 * the change, so the icon never lies about what was stored.
 */
export function FavoriteButton({
  contentId,
  initialSaved,
  isSignedIn,
  returnTo,
  className,
}: FavoriteButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!isSignedIn) {
      setPromptOpen(true);
      return;
    }

    setError(null);
    const previous = saved;
    setSaved(!previous); // optimistic

    startTransition(async () => {
      const result = await toggleFavoriteAction(contentId);

      if (result.status === "unauthenticated") {
        setSaved(previous);
        setPromptOpen(true);
        return;
      }
      if (result.status === "error") {
        setSaved(previous);
        setError(result.message);
        return;
      }
      setSaved(result.saved);
    });
  }

  return (
    <>
      <div className={cn("flex flex-col gap-1", className)}>
        <Button
          type="button"
          variant={saved ? "primary" : "secondary"}
          size="sm"
          onClick={handleClick}
          disabled={isPending}
          aria-pressed={isSignedIn ? saved : undefined}
          aria-label={saved ? "Remove from saved" : "Save this recording"}
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : saved ? (
            <BookmarkCheck className="size-3.5" aria-hidden="true" />
          ) : (
            <Bookmark className="size-3.5" aria-hidden="true" />
          )}
          {saved ? "Saved" : "Save"}
        </Button>

        {error ? (
          <p role="alert" className="text-2xs text-critical">
            {error}
          </p>
        ) : null}
      </div>

      <Modal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Sign in to save"
        description="Saved recordings are kept with your account, so they follow you between devices."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPromptOpen(false)}>
              Not now
            </Button>
            <Button asChild size="sm">
              <Link href={loginWithCallback(returnTo)}>Sign in</Link>
            </Button>
          </div>
        }
      >
        <p className="text-meta text-ink-muted">
          You&apos;ll come straight back to this page afterwards.
        </p>
      </Modal>
    </>
  );
}
