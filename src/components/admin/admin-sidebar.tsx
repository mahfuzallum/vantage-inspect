"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { adminNav } from "@/config/navigation";
import { routes } from "@/config/routes";
import { logoutAction } from "@/server/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import type { UserRole } from "@prisma/client";

export type AdminSidebarProps = {
  user: { name: string; role: UserRole; image: string | null };
};

/**
 * Fixed rail on desktop, drawer on mobile.
 *
 * The nav list is defined once in config and rendered in both places, so the
 * two can never drift apart.
 */
export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Any navigation closes the drawer.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isActive = (href: string) =>
    href === routes.admin.root ? pathname === href : pathname.startsWith(href);

  const navList = (
    <ul className="space-y-0.5">
      {adminNav.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              "block rounded-control px-3 py-2 text-sm transition-colors",
              isActive(item.href)
                ? "bg-raised font-medium text-ink"
                : "text-ink-muted hover:bg-raised hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  const profile = (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-2.5">
        <Avatar name={user.name} src={user.image} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink">{user.name}</p>
          <p className="slate">{user.role}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <Link
          href={routes.home}
          className="block rounded-control px-3 py-2 text-sm text-ink-muted hover:bg-raised hover:text-ink"
        >
          View the archive
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-critical"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Compact bar, mobile only */}
      <div className="flex h-14 items-center gap-2 border-b border-line bg-surface px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={open}
          className="rounded-control p-2 text-ink-muted hover:bg-raised hover:text-ink"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <span aria-hidden="true" className="h-5 w-1 rounded-full bg-accent" />
        <span className="font-display text-sm font-semibold">Admin</span>
      </div>

      {/* Persistent rail, desktop only */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
          <span aria-hidden="true" className="h-5 w-1 rounded-full bg-accent" />
          <span className="font-display text-sm font-semibold">Admin</span>
        </div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto p-2">
          {navList}
        </nav>
        {profile}
      </aside>

      {/* Drawer */}
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Admin menu"
          className="fixed inset-0 z-50 flex md:hidden"
        >
          <div
            className="absolute inset-0 bg-sunken/70"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-surface">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="font-display text-sm font-semibold">Admin</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close admin menu"
                className="rounded-control p-2 text-ink-muted hover:bg-raised hover:text-ink"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label="Admin" className="flex-1 overflow-y-auto p-2">
              {navList}
            </nav>
            {profile}
          </div>
        </div>
      ) : null}
    </>
  );
}
