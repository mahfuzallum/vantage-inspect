"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, Search, X } from "lucide-react";
import { primaryNav, accountNav } from "@/config/navigation";
import { routes } from "@/config/routes";
import { logoutAction } from "@/server/actions/auth";
import { SearchBar } from "./search-bar";
import { cn } from "@/lib/utils/cn";

/**
 * Full-height drawer rather than a shrunken desktop bar: on a phone the browse
 * rail and account links deserve real tap targets. Opening via the search icon
 * lands focus in the field; opening via the menu icon lands focus on Close.
 */
export function MobileNav({ isSignedIn }: { isSignedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  // Any navigation dismisses the drawer.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) {
      openerRef.current?.focus();
      return;
    }
    document.body.style.overflow = "hidden";
    if (!focusSearch) closeRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, focusSearch]);

  function openDrawer(withSearch: boolean) {
    setFocusSearch(withSearch);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openDrawer(true)}
        aria-label="Search"
        className="rounded-control p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink lg:hidden"
      >
        <Search className="size-5" aria-hidden="true" />
      </button>

      <button
        ref={openerRef}
        type="button"
        onClick={() => openDrawer(false)}
        aria-label="Open menu"
        aria-expanded={open}
        className="rounded-control p-2 text-ink-muted transition-colors hover:bg-raised hover:text-ink md:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-0 z-50 flex flex-col bg-base"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <span className="slate slate-accent">Menu</span>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="rounded-control p-2 text-ink-muted hover:bg-raised hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            <SearchBar autoFocus={focusSearch} />

            <nav aria-label="Browse">
              <ul className="space-y-1">
                {primaryNav.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "block rounded-control px-3 py-3 transition-colors",
                          isActive
                            ? "bg-raised text-ink"
                            : "text-ink-muted hover:bg-raised hover:text-ink",
                        )}
                      >
                        <span className="font-display font-semibold">{item.label}</span>
                        {item.description ? (
                          <span className="mt-0.5 block text-meta text-ink-faint">
                            {item.description}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <nav
              aria-label={isSignedIn ? "Account" : "Sign in"}
              className="border-t border-line pt-4"
            >
              <p className="slate mb-2 px-3">Account</p>
              <ul className="space-y-1">
                {(isSignedIn
                  ? accountNav
                  : [
                      { label: "Sign in", href: routes.auth.login },
                      { label: "Create account", href: routes.auth.register },
                    ]
                ).map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-control px-3 py-2.5 text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

              {isSignedIn ? (
                <form action={logoutAction} className="mt-2">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-control px-3 py-2.5 text-left text-sm text-ink-muted transition-colors hover:bg-raised hover:text-critical"
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                    Sign out
                  </button>
                </form>
              ) : null}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
