"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNav } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Browse" className={className}>
      <ul className="flex items-center gap-1">
        {primaryNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative rounded-control px-3 py-2 text-sm transition-colors",
                  isActive ? "text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {item.label}
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
