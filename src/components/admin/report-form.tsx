"use client";

import { useActionState } from "react";
import { updateReportAction } from "@/server/actions/admin-users";
import { initialAdminState } from "@/server/actions/admin-form-state";
import { FormMessage, SubmitButton } from "@/components/forms/form-feedback";
import { FormSection } from "./admin-shell";
import { Select, Textarea } from "@/components/ui/input";

/** Moderation decision plus an internal note. The note is never public. */
export function ReportReviewForm({
  reportId,
  status,
  handlerNote,
}: {
  reportId: string;
  status: string;
  handlerNote: string;
}) {
  const [state, action] = useActionState(
    updateReportAction.bind(null, reportId),
    initialAdminState,
  );

  return (
    <form action={action}>
      <FormSection title="Decision" description="Resolving or dismissing records who handled it.">
        <FormMessage status={state.status} message={state.message} />

        <div className="space-y-1.5">
          <label htmlFor="report-status" className="block text-sm font-medium text-ink">
            Status
          </label>
          <Select id="report-status" name="status" defaultValue={status}>
            <option value="OPEN">Open</option>
            <option value="IN_REVIEW">In review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="handlerNote" className="block text-sm font-medium text-ink">
            Internal note
          </label>
          <Textarea
            id="handlerNote"
            name="handlerNote"
            rows={3}
            maxLength={2000}
            defaultValue={handlerNote}
            placeholder="What was checked, and what was decided."
          />
          {/* Stated plainly so nobody writes into it expecting the reader to see it. */}
          <p className="text-meta text-ink-faint">
            Visible to staff only. It is never shown on a public page or to the reporter.
          </p>
        </div>

        <SubmitButton pendingLabel="Saving…">Save decision</SubmitButton>
      </FormSection>
    </form>
  );
}
