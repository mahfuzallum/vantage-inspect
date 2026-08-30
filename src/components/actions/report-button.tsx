"use client";

import { useState, useTransition } from "react";
import { Flag, Loader2 } from "lucide-react";
import { submitReportAction } from "@/server/actions/reports";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

const REASONS = [
  { value: "BROKEN_MEDIA", label: "The media won't play" },
  { value: "INCORRECT_METADATA", label: "The details are wrong" },
  { value: "COPYRIGHT", label: "Copyright concern" },
  { value: "SPAM", label: "Spam or misplaced" },
  { value: "OTHER", label: "Something else" },
] as const;

/** Reports a problem with a record. Open to signed-out readers, rate limited. */
export function ReportButton({ contentId }: { contentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitReportAction({ targetId: contentId, reason, message });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setSent(true);
    });
  }

  function close() {
    setOpen(false);
    // Reset only after closing, so the confirmation stays readable.
    window.setTimeout(() => {
      setSent(false);
      setReason("");
      setMessage("");
      setError(null);
    }, 200);
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Flag className="size-3.5" aria-hidden="true" />
        Report
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={sent ? "Report received" : "Report a problem"}
        description={
          sent ? undefined : "Tell us what's wrong and an archivist will look at the record."
        }
        footer={
          sent ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={close}>
                Close
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={!reason || isPending}>
                {isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Send report
              </Button>
            </div>
          )
        }
      >
        {sent ? (
          <p className="text-meta text-ink-muted">
            Thanks — it&apos;s in the moderation queue. We don&apos;t reply to every report, but
            each one is read.
          </p>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-ink">What&apos;s wrong?</legend>
              {REASONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2.5 text-meta text-ink-muted"
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={(event) => setReason(event.target.value)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <FormField label="Anything to add?" hint="Optional.">
              {(field) => (
                <Textarea
                  {...field}
                  rows={3}
                  maxLength={2000}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Where does it go wrong?"
                />
              )}
            </FormField>

            {error ? (
              <p role="alert" className="text-sm text-critical">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}
