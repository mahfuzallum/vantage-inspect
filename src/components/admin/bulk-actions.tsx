"use client";

import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import { bulkContentAction } from "@/server/actions/admin-content";
import { initialAdminState } from "@/server/actions/admin-form-state";
import { FormMessage } from "@/components/forms/form-feedback";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

/**
 * Bulk toolbar wrapped around the content table.
 *
 * Deletion is gated twice: a confirmation step here, and an ADMIN role check
 * plus an explicit `confirmed` flag on the server. Neither alone is enough, so
 * a stray click on a checkbox column cannot destroy a page of records.
 */
export function BulkContentActions({ children }: { children: ReactNode }) {
  const [state, action] = useActionState(bulkContentAction, initialAdminState);
  const [pendingDelete, setPendingDelete] = useState(false);

  return (
    <form action={action} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-3 py-2.5">
        <label htmlFor="bulk-action" className="slate">
          With selected
        </label>
        <Select
          id="bulk-action"
          name="action"
          defaultValue="publish"
          className="h-8 w-auto"
          onChange={(event) => setPendingDelete(event.target.value === "delete")}
        >
          <option value="publish">Publish</option>
          <option value="unpublish">Move to draft</option>
          <option value="archive">Archive</option>
          <option value="feature">Feature</option>
          <option value="unfeature">Unfeature</option>
          <option value="delete">Delete…</option>
        </Select>

        {/* Only present once delete is chosen; the server requires it too. */}
        <input type="hidden" name="confirmed" value={pendingDelete ? "true" : "false"} />

        <Button type="submit" size="sm" variant={pendingDelete ? "danger" : "secondary"}>
          {pendingDelete ? "Delete permanently" : "Apply"}
        </Button>

        {pendingDelete ? (
          <p className="text-meta text-critical">
            This cannot be undone. Selected records and their links will be removed.
          </p>
        ) : null}
      </div>

      {children}
    </form>
  );
}
