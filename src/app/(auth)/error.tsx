"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";

/** Keeps the reader inside the auth shell when a sign-in screen fails. */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[auth] render error:", error);
  }, [error]);

  return (
    <ErrorState
      title="This didn't load"
      description={
        error.digest
          ? `Something went wrong before the page finished. Reference ${error.digest}.`
          : "Something went wrong before the page finished loading."
      }
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href={routes.home}>Back to the archive</Link>
          </Button>
        </div>
      }
    />
  );
}
