"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ShareButtonProps = {
  /** Absolute URL — built on the server so it is correct in every environment. */
  url: string;
  title: string;
  text?: string;
};

/**
 * Native share sheet where the platform provides one, clipboard copy
 * everywhere else. No third-party share SDKs, so no tracking scripts and
 * nothing to load before the button works.
 */
export function ShareButton({ url, title, text }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleShare() {
    setFailed(false);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // Dismissing the sheet throws; fall through to copying instead.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={() => void handleShare()}>
        {copied ? (
          <Check className="size-3.5 text-positive" aria-hidden="true" />
        ) : (
          <Share2 className="size-3.5" aria-hidden="true" />
        )}
        {copied ? "Link copied" : "Share"}
      </Button>

      {failed ? (
        <p role="alert" className="max-w-48 text-2xs text-ink-muted">
          Copying was blocked. The address bar holds the same link.
        </p>
      ) : null}

      {/* Announced without stealing focus from the button. */}
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to clipboard" : ""}
      </span>
    </div>
  );
}

/** Explicit copy control, for places where a share sheet would be overkill. */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Copy link to this recording"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? (
        <Check className="size-3.5 text-positive" aria-hidden="true" />
      ) : (
        <Link2 className="size-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy link"}
    </Button>
  );
}
