"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { accountNav } from "@/config/navigation";
import { logoutAction } from "@/server/actions/auth";
import { routes } from "@/config/routes";
import { isStaff } from "@/lib/auth/roles";
import type { UserRole } from "@prisma/client";

export type UserMenuProps = {
  user: { name: string | null; image: string | null; role: UserRole } | null;
};

export function UserMenu({ user }: UserMenuProps) {
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href={routes.auth.login}>Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href={routes.auth.register}>Create account</Link>
        </Button>
      </div>
    );
  }

  const displayName = user.name ?? "Account";

  return (
    <Dropdown
      buttonClassName="border-0 bg-transparent px-1 hover:bg-raised"
      label={
        <>
          <Avatar name={displayName} src={user.image} size="sm" />
          <span className="sr-only">Open account menu</span>
        </>
      }
    >
      {(close) => (
        <>
          <p className="border-b border-line px-3 pb-2 pt-1 text-sm font-medium text-ink">
            {displayName}
          </p>

          {accountNav.map((item) => (
            <DropdownItem key={item.href} asChild onClick={close}>
              <Link href={item.href}>{item.label}</Link>
            </DropdownItem>
          ))}

          {isStaff(user.role) ? (
            <DropdownItem onClick={close} asChild>
              <Link href={routes.admin.root}>Admin</Link>
            </DropdownItem>
          ) : null}

          <div className="my-1 border-t border-line" />
          {/*
            Signing out is a POST server action, not a link — a GET route could
            be triggered by a prefetch or an image tag on another site.
          */}
          <form action={logoutAction}>
            <DropdownItem as="button" onClick={close}>
              <LogOut className="size-3.5" aria-hidden="true" />
              Sign out
            </DropdownItem>
          </form>
        </>
      )}
    </Dropdown>
  );
}
