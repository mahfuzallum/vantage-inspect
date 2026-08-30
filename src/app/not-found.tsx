import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";

export default function NotFound() {
  return (
    <Container className="flex min-h-dvh flex-col items-center justify-center py-24 text-center">
      <p className="slate slate-accent">Error 404</p>
      <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
        This page isn&apos;t in the archive
      </h1>
      <p className="mt-3 max-w-md text-ink-muted">
        The link may be out of date, or the item was removed. Search the catalogue or start from the
        latest additions.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href={routes.home}>Go to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={routes.search()}>Search the archive</Link>
        </Button>
      </div>
    </Container>
  );
}
