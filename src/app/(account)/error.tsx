"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";

/**
 * Scoped to the account area, so the header, footer and account navigation
 * stay rendered and the reader keeps their way out.
 */
export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[account] render error:", error);
  }, [error]);

  return (
    <ErrorState
      title="This page didn't load"
      description={
        error.digest
          ? `Your account is fine — this page just failed to render. Reference ${error.digest}.`
          : "Your account is fine — this page just failed to render."
      }
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <Link href={routes.account.root}>Account overview</Link>
          </Button>
        </div>
      }
    />
  );
}
