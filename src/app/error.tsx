"use client";

import { useEffect } from "react";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with the project's error reporter when one is added.
    console.error("[app] render error:", error);
  }, [error]);

  return (
    <Container className="flex min-h-dvh flex-col items-center justify-center py-24 text-center">
      <p className="slate slate-accent">Something broke</p>
      <h1 className="mt-3 font-display text-3xl font-semibold">This page didn&apos;t load</h1>
      <p className="mt-3 max-w-md text-ink-muted">
        The request failed before the page finished rendering. Try again — if it keeps happening,
        the reference below helps us trace it.
      </p>
      {error.digest ? <p className="slate mt-4">Ref {error.digest}</p> : null}
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </Container>
  );
}
