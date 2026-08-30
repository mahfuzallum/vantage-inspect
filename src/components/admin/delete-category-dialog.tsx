"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { deleteCategoryAction } from "@/server/actions/admin-taxonomy";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

/**
 * Deleting a subject that still holds content.
 *
 * The administrator has to make an explicit choice about what happens to that
 * content — move it somewhere, or accept that it becomes uncategorised. The
 * server performs both steps in one transaction, so content can never end up
 * pointing at a subject that no longer exists.
 */
export function DeleteCategoryDialog({
  categoryId,
  categoryName,
  contentCount,
  alternatives,
}: {
  categoryId: string;
  categoryName: string;
  contentCount: number;
  alternatives: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCategoryAction(categoryId, reassignTo || undefined);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete “${categoryName}”?`}
        description={
          contentCount > 0
            ? `${contentCount} recording${contentCount === 1 ? " is" : "s are"} filed under this subject.`
            : "Nothing is filed under this subject."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={isPending}>
              {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Delete subject
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {contentCount > 0 ? (
            <div className="space-y-1.5">
              <label htmlFor="reassign" className="block text-sm font-medium text-ink">
                Move that content to
              </label>
              <Select
                id="reassign"
                value={reassignTo}
                onChange={(event) => setReassignTo(event.target.value)}
              >
                <option value="">Leave it uncategorised</option>
                {alternatives.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
              <p className="text-meta text-ink-muted">
                The recordings themselves are never deleted — only the filing changes.
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-critical">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
