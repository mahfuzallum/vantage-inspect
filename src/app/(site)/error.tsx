"use client";

import { useEffect } from "react";
import { Container } from "@/components/layout/container";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

/**
 * Scoped to the public site, so the header and footer stay rendered and the
 * reader keeps their navigation when a page fails.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[site] render error:", error);
  }, [error]);

  return (
    <Container className="py-20">
      <ErrorState
        title="This page didn't load"
        description={
          error.digest
            ? `The request failed before the page finished rendering. Reference ${error.digest}.`
            : "The request failed before the page finished rendering."
        }
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Container>
  );
}
