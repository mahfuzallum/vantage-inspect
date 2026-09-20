"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PLATFORMS = [
  "Stripchat",
  "Chaturbate",
  "BongaCams",
  "Cam4",
  "Other",
] as const;

type FormState =
  | {
      status: "idle";
    }
  | {
      status: "submitting";
    }
  | {
      status: "success";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

export default function RequestModelForm() {
  const [formState, setFormState] = useState<FormState>({
    status: "idle",
  });

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (formState.status === "submitting") {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);

    const platform = String(
      data.get("platform") ?? "",
    ).trim();

    const username = String(
      data.get("username") ?? "",
    ).trim();

    const profileUrl = String(
      data.get("profileUrl") ?? "",
    ).trim();

    const email = String(
      data.get("email") ?? "",
    ).trim();

    const message = String(
      data.get("message") ?? "",
    ).trim();

    if (!platform) {
      setFormState({
        status: "error",
        message: "Please choose a platform.",
      });
      return;
    }

    if (username.length < 2) {
      setFormState({
        status: "error",
        message:
          "Please enter a valid model username.",
      });
      return;
    }

    if (
      profileUrl &&
      !/^https?:\/\//i.test(profileUrl)
    ) {
      setFormState({
        status: "error",
        message:
          "Profile URL must start with http:// or https://.",
      });
      return;
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setFormState({
        status: "error",
        message:
          "Please enter a valid email address.",
      });
      return;
    }

    setFormState({
      status: "submitting",
    });

    try {
      const response = await fetch(
        "/api/request-model",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            platform,
            username,
            profileUrl: profileUrl || null,
            email: email || null,
            message: message || null,
          }),
        },
      );

      const result = (await response
        .json()
        .catch(() => null)) as
        | {
            ok?: boolean;
            message?: string;
          }
        | null;

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message ??
            "We could not submit your request. Please try again.",
        );
      }

      form.reset();

      setFormState({
        status: "success",
        message:
          result.message ??
          "Your request has been submitted successfully.",
      });
    } catch (error) {
      setFormState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "We could not submit your request. Please try again.",
      });
    }
  }

  const isSubmitting =
    formState.status === "submitting";

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-7">
      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        <div className="space-y-2">
          <label
            htmlFor="platform"
            className="text-sm font-medium text-ink"
          >
            Platform
            <span
              aria-hidden="true"
              className="ml-1 text-accent"
            >
              *
            </span>
          </label>

          <select
            id="platform"
            name="platform"
            required
            defaultValue=""
            className="h-11 w-full rounded-control border border-line bg-sunken px-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option
              value=""
              disabled
            >
              Select a platform
            </option>

            {PLATFORMS.map((platform) => (
              <option
                key={platform}
                value={platform}
              >
                {platform}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="username"
            className="text-sm font-medium text-ink"
          >
            Model username
            <span
              aria-hidden="true"
              className="ml-1 text-accent"
            >
              *
            </span>
          </label>

          <Input
            id="username"
            name="username"
            type="text"
            required
            minLength={2}
            maxLength={100}
            autoComplete="off"
            placeholder="Enter the model username"
            className="h-11 bg-sunken"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="profileUrl"
            className="text-sm font-medium text-ink"
          >
            Public profile URL
            <span className="ml-2 text-xs font-normal text-ink-faint">
              Optional
            </span>
          </label>

          <Input
            id="profileUrl"
            name="profileUrl"
            type="url"
            maxLength={500}
            placeholder="https://..."
            className="h-11 bg-sunken"
          />

          <p className="text-xs leading-5 text-ink-faint">
            A direct public profile link helps us
            identify the correct creator.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium text-ink"
          >
            Email
            <span className="ml-2 text-xs font-normal text-ink-faint">
              Optional
            </span>
          </label>

          <Input
            id="email"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            placeholder="you@example.com"
            className="h-11 bg-sunken"
          />

          <p className="text-xs leading-5 text-ink-faint">
            Logged-in users do not need to enter their
            account email here.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="message"
            className="text-sm font-medium text-ink"
          >
            Additional information
            <span className="ml-2 text-xs font-normal text-ink-faint">
              Optional
            </span>
          </label>

          <textarea
            id="message"
            name="message"
            rows={5}
            maxLength={1000}
            placeholder="Anything that can help us identify or review this request..."
            className="w-full resize-y rounded-control border border-line bg-sunken px-3 py-3 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>

        {formState.status === "error" ? (
          <div
            role="alert"
            className="rounded-control border border-red-400/20 bg-red-400/10 px-3 py-3 text-sm text-red-200"
          >
            {formState.message}
          </div>
        ) : null}

        {formState.status === "success" ? (
          <div
            role="status"
            className="rounded-control border border-accent/20 bg-accent/10 px-3 py-3 text-sm text-accent"
          >
            {formState.message}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-ink-faint">
            Requests are reviewed before a creator is
            added to the archive.
          </p>

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="min-w-36"
          >
            {isSubmitting
              ? "Submitting..."
              : "Submit Request"}
          </Button>
        </div>
      </form>
    </section>
  );
}