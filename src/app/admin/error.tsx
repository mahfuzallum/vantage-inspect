"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";

/**
 * Admin error boundary.
 *
 * In production this shows only the digest, so an operator can correlate with
 * the server log — an admin screen is still a browser, and the reader may not
 * be the person who deployed it.
 *
 * In development it shows the message as well. A reference number alone means
 * opening a terminal and scrolling through a log to learn that a line in .env
 * is wrong, which is a poor trade when the only reader is the developer who
 * started the server.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    console.error("[admin] render error:", error);
  }, [error]);

  return (
    <Container className="py-16">
      <ErrorState
        title="This admin page didn't load"
        description={
          isDev && error.message
            ? error.message
            : error.digest
              ? `The query behind this screen failed. Reference ${error.digest} in the server log.`
              : "The query behind this screen failed. Check the server log for detail."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button asChild variant="outline">
              <Link href={routes.admin.root}>Dashboard</Link>
            </Button>
          </div>
        }
      />
    </Container>
  );
}
