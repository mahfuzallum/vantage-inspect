"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { mergeTagsAction } from "@/server/actions/admin-taxonomy";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { routes } from "@/config/routes";

/** Merges this topic into another. Duplicated links are skipped server-side. */
export function MergeTagControl({
  sourceId,
  sourceName,
  targets,
}: {
  sourceId: string;
  sourceName: string;
  targets: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="merge-target" className="block text-sm font-medium text-ink">
          Merge “{sourceName}” into
        </label>
        <Select
          id="merge-target"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="">Choose a topic…</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
        </Select>
      </div>

      <Button
        variant="secondary"
        size="sm"
        disabled={!targetId || isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await mergeTagsAction(sourceId, targetId);
            setMessage(result.message);
            if (result.ok) router.push(routes.admin.tags);
          })
        }
      >
        {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        Merge and delete this topic
      </Button>

      {message ? (
        <p role="status" className="text-meta text-ink-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
