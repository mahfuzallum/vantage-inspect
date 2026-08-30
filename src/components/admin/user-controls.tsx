"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setUserRoleAction, setUserStatusAction } from "@/server/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ConfirmDialog } from "./confirm-dialog";
import type { UserRole } from "@prisma/client";

/**
 * Suspension and role controls.
 *
 * The server refuses self-suspension, self-demotion and removing the last
 * administrator; disabling the controls here is only a courtesy so the
 * administrator does not attempt something that will be rejected.
 */
export function UserAdminControls({
  userId,
  username,
  isActive,
  role,
  isSelf,
}: {
  userId: string;
  username: string;
  isActive: boolean;
  role: UserRole;
  isSelf: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [nextRole, setNextRole] = useState<UserRole>(role);
  const [isPending, startTransition] = useTransition();

  if (isSelf) {
    return (
      <p className="text-meta text-ink-muted">
        This is your own account. Suspension and role changes must be made by another administrator.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label htmlFor="user-role" className="block text-sm font-medium text-ink">
            Role
          </label>
          <Select
            id="user-role"
            value={nextRole}
            onChange={(event) => setNextRole(event.target.value as UserRole)}
          >
            <option value="USER">User</option>
            <option value="MODERATOR">Moderator</option>
            <option value="ADMIN">Administrator</option>
          </Select>
        </div>

        <Button
          variant="secondary"
          size="md"
          disabled={nextRole === role || isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await setUserRoleAction(userId, nextRole);
              setMessage(result.message);
            })
          }
        >
          {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          Update role
        </Button>
      </div>

      <ConfirmDialog
        trigger={
          <Button variant={isActive ? "danger" : "secondary"} size="sm">
            {isActive ? "Suspend account" : "Reinstate account"}
          </Button>
        }
        title={isActive ? `Suspend @${username}?` : `Reinstate @${username}?`}
        description={
          isActive
            ? "They will be signed out immediately and cannot sign in again until reinstated. Their saved items and history are kept."
            : "They will be able to sign in again."
        }
        confirmLabel={isActive ? "Suspend" : "Reinstate"}
        variant={isActive ? "danger" : "primary"}
        action={async () => {
          const result = await setUserStatusAction(userId, isActive ? "suspend" : "reinstate");
          setMessage(result.message);
        }}
      />

      {message ? (
        <p role="status" className="text-meta text-ink-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
