import Link from "next/link";
import { Container } from "./container";
import { footerNav } from "@/config/navigation";
import { siteConfig } from "@/config/site";
import { routes } from "@/config/routes";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <Container className="grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="space-y-3">
          <Link href={routes.home} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-5 w-1 rounded-full bg-accent" />
            <span className="font-display text-base font-semibold">{siteConfig.name}</span>
          </Link>
          <p className="max-w-xs text-meta leading-relaxed text-ink-muted">
            A public archive of recorded talks, lectures, documentaries and interviews, catalogued
            so they stay findable.
          </p>
        </div>

        {footerNav.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="slate mb-3">{group.heading}</h2>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-meta text-ink-muted transition-colors hover:text-accent"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>

      <Container className="flex flex-col gap-2 border-t border-line py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="slate">
          © {new Date().getFullYear()} {siteConfig.name}
        </p>
        <p className="slate">
          <Link href={routes.legal.contact} className="hover:text-accent">
            {siteConfig.contactEmail}
          </Link>
        </p>
      </Container>
    </footer>
  );
}
