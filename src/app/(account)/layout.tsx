import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Container } from "@/components/layout/container";
import { accountNav } from "@/config/navigation";
import { requireUser } from "@/lib/auth/guards";

/**
 * Every /account route is gated here as well as in middleware — defence in
 * depth, so a routing change can never expose a private page.
 */
/** The whole private area stays out of search indexes. */
export const metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser("/account");

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1">
        <Container className="py-8">
          <p className="slate slate-accent">Signed in as {user.username}</p>

          <div className="mt-6 grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
            <nav aria-label="Account" className="lg:border-r lg:border-line lg:pr-4">
              <ul className="flex gap-1 overflow-x-auto lg:flex-col">
                {accountNav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block whitespace-nowrap rounded-control px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="min-w-0">{children}</div>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
