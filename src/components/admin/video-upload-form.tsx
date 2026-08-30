"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  Loader2,
  RotateCw,
  Upload,
  X,
} from "lucide-react";
import { CreatorPicker, type CreatorOption } from "./creator-picker";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { routes } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

export type UploadOption = {
  id: string;
  name: string;
};

export type VideoUploadFormProps = {
  categories: UploadOption[];
  tags: UploadOption[];
  maxUploadMb: number;
  acceptedExtensions: string[];
};

type UploadStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "error";

type UploadItem = {
  id: string;
  file: File;
  title: string;
  progress: number;
  status: UploadStatus;
  message?: string;
  contentId?: string;
  slug?: string;
};

type UploadMode = "upload" | "publish";

function formatBytes(bytes: number): string {
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (
    value >= 1024 &&
    unit < units.length - 1
  ) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(
    unit === 0 ? 0 : 1,
  )} ${units[unit]}`;
}

function suggestedTitle(
  creatorName: string,
  index: number,
): string {
  const cleanCreator =
    creatorName
      .replace(/\s+/g, " ")
      .trim();

  return `${cleanCreator} Webcam Video ${String(
    index,
  ).padStart(2, "0")}`;
}

function getFileExtension(
  file: File,
): string {
  return (
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() ?? ""
  );
}

export function VideoUploadForm({
  categories,
  tags,
  maxUploadMb,
  acceptedExtensions,
}: VideoUploadFormProps) {
  const router = useRouter();

  const inputRef =
    useRef<HTMLInputElement>(null);

  const requestRefs = useRef(
    new Map<string, XMLHttpRequest>(),
  );

  const [creator, setCreator] =
    useState<CreatorOption | null>(null);

  const [files, setFiles] =
    useState<UploadItem[]>([]);

  const [categoryId, setCategoryId] =
    useState("");

  const [tagIds, setTagIds] =
    useState<string[]>([]);

  const [summary, setSummary] =
    useState("");

  const [uploading, setUploading] =
    useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  const [errors, setErrors] =
    useState<Record<string, string>>({});

  const [dragging, setDragging] =
    useState(false);

  const accept =
    acceptedExtensions
      .map(
        (extension) =>
          `.${extension}`,
      )
      .join(",");

  const maxBytes =
    maxUploadMb * 1024 * 1024;

  function addFiles(
    nextFiles: File[],
  ) {
    if (nextFiles.length === 0) {
      return;
    }

    const nextErrors: Record<
      string,
      string
    > = {};

    const validFiles: File[] = [];

    for (const file of nextFiles) {
      const extension =
        getFileExtension(file);

      if (
        !acceptedExtensions.includes(
          extension,
        )
      ) {
        nextErrors.file =
          `That file type isn't accepted. Use ${acceptedExtensions.join(
            ", ",
          )}.`;

        continue;
      }

      if (file.size <= 0) {
        nextErrors.file =
          `${file.name} is empty.`;

        continue;
      }

      if (file.size > maxBytes) {
        nextErrors.file =
          `${file.name} is ${formatBytes(
            file.size,
          )}. The limit is ${maxUploadMb}MB.`;

        continue;
      }

      const duplicate =
        files.some(
          (item) =>
            item.file.name ===
              file.name &&
            item.file.size ===
              file.size &&
            item.file
              .lastModified ===
              file.lastModified,
        );

      if (duplicate) {
        continue;
      }

      validFiles.push(file);
    }

    setErrors(nextErrors);

    if (validFiles.length === 0) {
      return;
    }

    setFiles((previous) => {
      const startIndex =
        previous.length;

      const newItems: UploadItem[] =
        validFiles.map(
          (file, index) => ({
            id: [
              file.name,
              file.size,
              file.lastModified,
              Date.now(),
              index,
            ].join("-"),

            file,

            title: creator
              ? suggestedTitle(
                  creator.name,
                  startIndex +
                    index +
                    1,
                )
              : `Webcam Video ${String(
                  startIndex +
                    index +
                    1,
                ).padStart(2, "0")}`,

            progress: 0,
            status: "queued",
          }),
        );

      return [
        ...previous,
        ...newItems,
      ];
    });
  }

  function chooseFiles(
    nextFiles: File[],
  ) {
    setErrors((previous) => ({
      ...previous,
      file: "",
    }));

    addFiles(nextFiles);
  }

  function removeFile(id: string) {
    if (uploading) {
      return;
    }

    setFiles((previous) =>
      previous.filter(
        (item) =>
          item.id !== id,
      ),
    );
  }

  function updateTitle(
    id: string,
    title: string,
  ) {
    setFiles((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              title,
            }
          : item,
      ),
    );
  }

  function chooseCreator(
    next: CreatorOption | null,
  ) {
    setCreator(next);

    setErrors((previous) => ({
      ...previous,
      creator: "",
    }));

    if (!next) {
      return;
    }

    /*
     * When the creator changes, regenerate
     * automatic titles for files that are still
     * using the generated naming pattern.
     */
    setFiles((previous) =>
      previous.map(
        (item, index) => ({
          ...item,
          title:
            item.title.startsWith(
              "Webcam Video",
            ) ||
            item.title.includes(
              " Webcam Video ",
            )
              ? suggestedTitle(
                  next.name,
                  index + 1,
                )
              : item.title,
        }),
      ),
    );
  }

  function reset() {
    for (const request of requestRefs.current.values()) {
      request.abort();
    }

    requestRefs.current.clear();

    setFiles([]);
    setCreator(null);
    setCategoryId("");
    setTagIds([]);
    setSummary("");
    setUploading(false);
    setMessage(null);
    setErrors({});

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function validate(): boolean {
    const next: Record<
      string,
      string
    > = {};

    if (!creator) {
      next.creator =
        "Choose a contributor, or add a new one.";
    }

    if (files.length === 0) {
      next.file =
        "Choose at least one video file.";
    }

    if (!categoryId) {
      next.category =
        "Choose a category.";
    }

    for (const item of files) {
      if (
        item.title.trim().length <
        3
      ) {
        next.title =
          "Every video needs a title of at least 3 characters.";
        break;
      }
    }

    setErrors(next);

    return (
      Object.keys(next).length === 0
    );
  }

  function uploadOne(
    item: UploadItem,
    mode: UploadMode,
  ): Promise<void> {
    if (!creator) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const body = new FormData();

      body.set(
        "file",
        item.file,
      );

      body.set(
        "title",
        item.title.trim(),
      );

      body.set(
        "creatorId",
        creator.id,
      );

      body.set(
        "categoryId",
        categoryId,
      );

      body.set(
        "publish",
        mode === "publish"
          ? "true"
          : "false",
      );

      if (summary.trim()) {
        body.set(
          "summary",
          summary.trim(),
        );
      }

      for (const tagId of tagIds) {
        body.append(
          "tagIds",
          tagId,
        );
      }

      const request =
        new XMLHttpRequest();

      requestRefs.current.set(
        item.id,
        request,
      );

      setFiles((previous) =>
        previous.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status:
                  "uploading",
                progress: 0,
                message:
                  undefined,
              }
            : entry,
        ),
      );

      request.upload.addEventListener(
        "progress",
        (event) => {
          if (
            !event.lengthComputable
          ) {
            return;
          }

          const progress =
            Math.round(
              (event.loaded /
                event.total) *
                100,
            );

          setFiles((previous) =>
            previous.map(
              (entry) =>
                entry.id ===
                item.id
                  ? {
                      ...entry,
                      progress,
                    }
                  : entry,
            ),
          );
        },
      );

      request.addEventListener(
        "load",
        () => {
          requestRefs.current.delete(
            item.id,
          );

          try {
            const parsed =
              JSON.parse(
                request.responseText,
              ) as {
                data?: {
                  contentId?: string;
                  slug?: string;
                };
                error?: {
                  message?: string;
                };
              };

            if (
              request.status >=
                200 &&
              request.status < 300 &&
              parsed.data
                ?.contentId
            ) {
              setFiles(
                (previous) =>
                  previous.map(
                    (entry) =>
                      entry.id ===
                      item.id
                        ? {
                            ...entry,
                            status:
                              "uploaded",
                            progress:
                              100,
                            contentId:
                              parsed
                                .data
                                ?.contentId,
                            slug:
                              parsed
                                .data
                                ?.slug,
                          }
                        : entry,
                  ),
              );
            } else {
              setFiles(
                (previous) =>
                  previous.map(
                    (entry) =>
                      entry.id ===
                      item.id
                        ? {
                            ...entry,
                            status:
                              "error",
                            message:
                              parsed
                                .error
                                ?.message ??
                              "The upload was refused. Try again.",
                          }
                        : entry,
                  ),
              );
            }
          } catch {
            setFiles(
              (previous) =>
                previous.map(
                  (entry) =>
                    entry.id ===
                    item.id
                      ? {
                          ...entry,
                          status:
                            "error",
                          message:
                            "The server sent an unreadable response.",
                        }
                      : entry,
                ),
            );
          }

          resolve();
        },
      );

      request.addEventListener(
        "error",
        () => {
          requestRefs.current.delete(
            item.id,
          );

          setFiles((previous) =>
            previous.map(
              (entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      status:
                        "error",
                      message:
                        "The connection dropped before the file finished.",
                    }
                  : entry,
            ),
          );

          resolve();
        },
      );

      request.addEventListener(
        "abort",
        () => {
          requestRefs.current.delete(
            item.id,
          );

          setFiles((previous) =>
            previous.map(
              (entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      status:
                        "error",
                      message:
                        "Upload cancelled.",
                    }
                  : entry,
            ),
          );

          resolve();
        },
      );

      /*
       * Do NOT manually set Content-Type.
       * The browser creates the multipart
       * boundary automatically.
       */
      request.open(
        "POST",
        "/api/admin/videos/upload",
      );

      request.send(body);
    });
  }

  async function submit(
    mode: UploadMode,
  ) {
    if (uploading) {
      return;
    }

    if (!validate()) {
      return;
    }

    if (!creator) {
      return;
    }

    setUploading(true);
    setMessage(null);

    const pendingFiles =
      files.filter(
        (item) =>
          item.status ===
            "queued" ||
          item.status ===
            "error",
      );

    /*
     * Sequential upload:
     * one video finishes before the next starts.
     * This keeps memory usage predictable.
     */
    for (const item of pendingFiles) {
      await uploadOne(
        item,
        mode,
      );
    }

    setUploading(false);

    router.refresh();

    if (mode === "publish") {
      setMessage(
        "Upload finished. Videos were sent with automatic publish enabled.",
      );
    } else {
      setMessage(
        "Upload finished. Videos were uploaded as drafts.",
      );
    }
  }

  const queuedCount =
    files.filter(
      (item) =>
        item.status === "queued",
    ).length;

  const uploadingCount =
    files.filter(
      (item) =>
        item.status ===
        "uploading",
    ).length;

  const uploadedCount =
    files.filter(
      (item) =>
        item.status ===
        "uploaded",
    ).length;

  const errorCount =
    files.filter(
      (item) =>
        item.status === "error",
    ).length;

  const busy = uploading;

  return (
    <div className="space-y-6">
      {/* CREATOR */}
      <CreatorPicker
        value={creator}
        onChange={chooseCreator}
        error={errors.creator}
      />

      {/* VIDEO FILES */}
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">
          Video files
          <span
            className="ml-1 text-accent"
            aria-hidden="true"
          >
            *
          </span>
        </span>

        {files.length > 0 ? (
          <div className="space-y-3">
            {files.map(
              (item, index) => (
                <div
                  key={item.id}
                  className="rounded-control border border-line bg-raised px-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent">
                      {item.status ===
                      "uploading" ? (
                        <Loader2
                          className="size-5 animate-spin"
                          aria-hidden="true"
                        />
                      ) : item.status ===
                        "uploaded" ? (
                        <CheckCircle2
                          className="size-5 text-positive"
                          aria-hidden="true"
                        />
                      ) : (
                        <Film
                          className="size-5"
                          aria-hidden="true"
                        />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        {item.file.name}
                      </p>

                      <p className="slate">
                        {formatBytes(
                          item.file.size,
                        )}
                      </p>
                    </div>

                    <span className="shrink-0 text-xs text-ink-muted">
                      {item.status ===
                        "queued" &&
                        "Queued"}

                      {item.status ===
                        "uploading" &&
                        `${item.progress}%`}

                      {item.status ===
                        "uploaded" &&
                        "Uploaded"}

                      {item.status ===
                        "error" &&
                        "Failed"}
                    </span>

                    {!busy &&
                    item.status !==
                      "uploaded" ? (
                      <button
                        type="button"
                        onClick={() =>
                          removeFile(
                            item.id,
                          )
                        }
                        aria-label={`Remove ${item.file.name}`}
                        className="rounded-control p-1.5 text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                      >
                        <X
                          className="size-4"
                          aria-hidden="true"
                        />
                      </button>
                    ) : null}
                  </div>

                  {/* AUTOMATIC SEO TITLE */}
                  <div className="mt-3">
                    <label
                      htmlFor={`video-title-${item.id}`}
                      className="mb-1 block text-xs font-medium text-ink-muted"
                    >
                      Video title
                    </label>

                    <Input
                      id={`video-title-${item.id}`}
                      value={item.title}
                      disabled={busy}
                      onChange={(
                        event,
                      ) =>
                        updateTitle(
                          item.id,
                          event.target
                            .value,
                        )
                      }
                    />

                    <p className="mt-1 text-2xs text-ink-faint">
                      Automatic SEO
                      title #{index + 1}
                    </p>
                  </div>

                  {item.status ===
                  "uploading" ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-200"
                        style={{
                          width: `${item.progress}%`,
                        }}
                      />
                    </div>
                  ) : null}

                  {item.status ===
                    "error" &&
                  item.message ? (
                    <p className="mt-2 text-xs text-critical">
                      {item.message}
                    </p>
                  ) : null}

                  {item.status ===
                    "uploaded" &&
                  item.slug ? (
                    <div className="mt-2">
                      <Link
                        href={routes.content(
                          item.slug,
                        )}
                        className="text-xs text-accent underline"
                      >
                        View video
                      </Link>
                    </div>
                  ) : null}
                </div>
              ),
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  inputRef.current?.click()
                }
              >
                Add more videos
              </Button>

              {!busy ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={reset}
                >
                  Clear all
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            onDragOver={(
              event: DragEvent,
            ) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() =>
              setDragging(false)
            }
            onDrop={(
              event: DragEvent,
            ) => {
              event.preventDefault();
              setDragging(false);

              chooseFiles(
                Array.from(
                  event.dataTransfer
                    .files,
                ),
              );
            }}
            className={cn(
              "rounded-card border border-dashed px-6 py-10 text-center transition-colors",
              dragging
                ? "border-accent bg-accent/[0.06]"
                : "border-line hover:border-line-strong",
            )}
          >
            <Upload
              className="mx-auto size-6 text-ink-faint"
              aria-hidden="true"
            />

            <p className="mt-3 text-sm text-ink">
              Drop multiple videos
              here, or
            </p>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() =>
                inputRef.current?.click()
              }
            >
              Choose videos
            </Button>

            <p className="slate mt-3">
              {acceptedExtensions.join(
                ", ",
              )}{" "}
              · up to{" "}
              {maxUploadMb}MB each
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="sr-only"
          onChange={(event) => {
            chooseFiles(
              Array.from(
                event.target.files ??
                  [],
              ),
            );

            event.target.value = "";
          }}
        />

        {errors.file ? (
          <p
            role="alert"
            className="text-sm text-critical"
          >
            {errors.file}
          </p>
        ) : null}
      </div>

      {/* CATEGORY */}
      <FormField
        label="Category"
        required
        error={errors.category}
      >
        {(props) => (
          <Select
            {...props}
            value={categoryId}
            disabled={busy}
            onChange={(event) =>
              setCategoryId(
                event.target.value,
              )
            }
          >
            <option value="">
              Choose a category…
            </option>

            {categories.map(
              (category) => (
                <option
                  key={category.id}
                  value={
                    category.id
                  }
                >
                  {category.name}
                </option>
              ),
            )}
          </Select>
        )}
      </FormField>

      {/* TAGS */}
      <fieldset
        className="space-y-2"
        disabled={busy}
      >
        <legend className="text-sm font-medium text-ink">
          Tags
        </legend>

        <p className="text-sm text-ink-muted">
          Optional. Pick as many
          as apply.
        </p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {tags.length === 0 ? (
            <p className="slate">
              No tags exist yet.
            </p>
          ) : (
            tags.map((tag) => {
              const selected =
                tagIds.includes(
                  tag.id,
                );

              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={
                    selected
                  }
                  onClick={() =>
                    setTagIds(
                      (previous) =>
                        selected
                          ? previous.filter(
                              (
                                id,
                              ) =>
                                id !==
                                tag.id,
                            )
                          : [
                              ...previous,
                              tag.id,
                            ],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    selected
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {tag.name}
                </button>
              );
            })
          )}
        </div>
      </fieldset>

      {/* SUMMARY */}
      <FormField
        label="Summary"
        hint="Optional. Applied to every video in this batch."
      >
        {(props) => (
          <Textarea
            {...props}
            rows={2}
            value={summary}
            disabled={busy}
            maxLength={300}
            onChange={(event) =>
              setSummary(
                event.target.value,
              )
            }
          />
        )}
      </FormField>

      {/* BATCH STATUS */}
      {files.length > 0 ? (
        <div className="rounded-control border border-line bg-raised px-4 py-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
            <span>
              Total:{" "}
              <strong className="text-ink">
                {files.length}
              </strong>
            </span>

            <span>
              Queued:{" "}
              <strong className="text-ink">
                {queuedCount}
              </strong>
            </span>

            <span>
              Uploading:{" "}
              <strong className="text-ink">
                {uploadingCount}
              </strong>
            </span>

            <span>
              Uploaded:{" "}
              <strong className="text-positive">
                {uploadedCount}
              </strong>
            </span>

            {errorCount > 0 ? (
              <span>
                Failed:{" "}
                <strong className="text-critical">
                  {errorCount}
                </strong>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* MESSAGE */}
      {message ? (
        <div className="rounded-control border border-positive/40 bg-positive/[0.06] px-3 py-2.5 text-sm text-ink">
          {message}
        </div>
      ) : null}

      {/* ERROR */}
      {errorCount > 0 &&
      !busy ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control border border-critical/40 bg-critical/10 px-3 py-2.5 text-sm text-critical"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />

          <span className="flex-1">
            Some videos failed.
            Press the upload button
            again to retry only the
            failed videos.
          </span>

          <RotateCw
            className="size-3.5 shrink-0"
            aria-hidden="true"
          />
        </div>
      ) : null}

      {/* UPLOAD OPTIONS */}
      <div className="border-t border-line pt-5">
        <div className="mb-3">
          <p className="text-sm font-medium text-ink">
            Upload mode
          </p>

          <p className="mt-1 text-xs text-ink-muted">
            Choose whether videos
            should remain drafts or
            be published automatically
            after processing.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() =>
              submit("upload")
            }
            disabled={
              busy ||
              files.length === 0
            }
          >
            {busy
              ? "Uploading…"
              : "Upload Only"}
          </Button>

          <Button
            type="button"
            size="lg"
            onClick={() =>
              submit("publish")
            }
            disabled={
              busy ||
              files.length === 0
            }
          >
            {busy
              ? "Uploading…"
              : "Upload & Publish"}
          </Button>
        </div>
      </div>

      {/* CANCEL */}
      {busy ? (
        <div className="rounded-control border border-line bg-raised p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-ink">
              <Loader2
                className="size-4 animate-spin text-accent"
                aria-hidden="true"
              />
              Uploading videos
            </span>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                for (const request of requestRefs.current.values()) {
                  request.abort();
                }
              }}
            >
              Cancel current uploads
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}