import Link from "next/link";
import { Info } from "lucide-react";
import { Container } from "@/components/layout/container";
import { routes } from "@/config/routes";

/**
 * Shown only when the catalogue is empty and the page is rendering demo data.
 * Better to say so plainly than to let placeholder numbers read as real ones.
 */
export function DemoNotice() {
  return (
    <div className="border-b border-line bg-raised/60">
      <Container className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
        <Info className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-meta text-ink-muted">
          Showing sample data — the catalogue is empty. Run{" "}
          <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-2xs text-ink">
            npm run db:seed
          </code>{" "}
          to load it, or{" "}
          <Link href={routes.admin.content} className="text-accent hover:underline">
            add recordings in the admin
          </Link>
          .
        </p>
      </Container>
    </div>
  );
}
