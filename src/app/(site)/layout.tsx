import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AmbientBackground } from "@/components/layout/ambient-background";
import { MonetizationRuntime } from "@/components/monetization-runtime";

/** Chrome shared by every public page. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <AmbientBackground />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <MonetizationRuntime />
    </div>
  );
}
