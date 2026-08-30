"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Slot } from "./slot";
import { cn } from "@/lib/utils/cn";

export type DropdownProps = {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
  buttonClassName?: string;
};

/**
 * Click/Escape-dismissable menu with correct aria-expanded wiring.
 * Deliberately small: anything richer belongs in a dedicated component.
 */
export function Dropdown({
  label,
  children,
  align = "end",
  className,
  buttonClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-control border border-line",
          "bg-raised px-3 text-sm text-ink transition-colors hover:border-line-strong",
          buttonClassName,
        )}
      >
        {label}
        <ChevronDown
          className={cn("size-3.5 text-ink-faint transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute z-40 mt-1.5 min-w-48 overflow-hidden rounded-card border border-line",
            "bg-raised py-1 shadow-overlay",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export type DropdownItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Render the child (usually a <Link>) with menu-item styling and roles. */
  asChild?: boolean;
  /** "button" submits its enclosing form — used for the sign-out action. */
  as?: "button";
};

export function DropdownItem({ className, asChild = false, as, ...props }: DropdownItemProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      role="menuitem"
      {...(asChild ? {} : { type: as === "button" ? ("submit" as const) : ("button" as const) })}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-muted",
        "transition-colors hover:bg-surface hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}
