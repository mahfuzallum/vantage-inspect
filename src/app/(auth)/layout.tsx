import type { ReactNode } from "react";
import Link from "next/link";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site";

/**
 * Auth screens drop the browse chrome: one column, one task, no distraction.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 w-full max-w-screen-xl items-center px-4 sm:px-6">
          <Link href={routes.home} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-accent" />
            <span className="font-display text-base font-semibold">{siteConfig.shortName}</span>
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
