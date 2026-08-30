"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { DragEvent } from "react";
import { AlertTriangle, Check, ImageIcon, Loader2, RotateCw, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export type UploadScope =
  "contentThumbnail" | "contentVideo" | "creatorAvatar" | "creatorBanner" | "site";

export type UploadedAsset = { assetId: string; url: string | null; sizeBytes: number };

export type MediaUploaderProps = {
  scope: UploadScope;
  /** Record the asset belongs to. Required for everything except site slots. */
  entityId?: string;
  accept?: string;
  /** Existing asset URL, shown until a replacement is uploaded. */
  currentUrl?: string | null;
  label: string;
  hint?: string;
  onUploaded?: (asset: UploadedAsset) => void;
  className?: string;
};

type Phase = "idle" | "validating" | "uploading" | "recording" | "done" | "error";

function formatBytes(bytes: number): string {
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Reusable upload control: drag-and-drop or click, with a local preview,
 * real progress, cancel and retry.
 *
 * Two upload paths behind one interface. The server is asked to authorize an
 * upload; if the backend can sign one, the bytes go straight to storage and
 * never touch the application. If it cannot — local disk in development — the
 * file is posted through the app instead. The component reports which path it
 * actually used rather than implying a direct upload happened.
 *
 * XMLHttpRequest rather than fetch, because it is still the only way to get
 * real progress events and a working abort for an upload body.
 */
export function MediaUploader({
  scope,
  entityId,
  accept = "image/jpeg,image/png,image/webp,image/avif",
  currentUrl,
  label,
  hint,
  onUploaded,
  className,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const [viaProxy, setViaProxy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  const isVideo = scope === "contentVideo";

  /** Sends the body and reports progress. Resolves with the parsed response. */
  const sendWithProgress = useCallback(
    (
      method: "PUT" | "POST",
      url: string,
      body: XMLHttpRequestBodyInit,
      headers: Record<string, string>,
    ) =>
      new Promise<string>((resolve, reject) => {
        const request = new XMLHttpRequest();
        requestRef.current = request;

        request.open(method, url);
        for (const [key, value] of Object.entries(headers)) {
          request.setRequestHeader(key, value);
        }

        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        request.addEventListener("load", () => {
          if (request.status >= 200 && request.status < 300) resolve(request.responseText);
          else reject(new Error(`Upload failed (${request.status})`));
        });
        request.addEventListener("error", () =>
          reject(new Error("The network dropped the upload.")),
        );
        request.addEventListener("abort", () => reject(new Error("cancelled")));

        request.send(body);
      }),
    [],
  );

  const upload = useCallback(
    async (file: File) => {
      lastFileRef.current = file;
      setError(null);
      setProgress(0);
      setFileInfo({ name: file.name, size: file.size });
      setPhase("validating");

      // Local preview before a single byte is sent, so an obviously wrong file
      // can be spotted and swapped without a round trip.
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (file.type.startsWith("image/")) {
        const objectUrl = URL.createObjectURL(file);
        objectUrlRef.current = objectUrl;
        setPreview(objectUrl);
      }

      try {
        const authorizeResponse = await fetch("/api/admin/media/authorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            entityId,
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });

        const authorizePayload = await authorizeResponse.json();
        if (!authorizeResponse.ok || !authorizePayload.ok) {
          throw new Error(authorizePayload?.error?.message ?? "That file was rejected.");
        }

        setPhase("uploading");

        if (authorizePayload.data.mode === "direct") {
          const { upload: authorization, objectKey } = authorizePayload.data;

          await sendWithProgress(
            authorization.method,
            authorization.url,
            file,
            authorization.headers,
          );

          setPhase("recording");
          const confirmResponse = await fetch("/api/admin/media/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              objectKey,
              kind: isVideo ? "VIDEO" : "IMAGE",
              mimeType: file.type,
              originalName: file.name,
            }),
          });
          const confirmPayload = await confirmResponse.json();
          if (!confirmResponse.ok || !confirmPayload.ok) {
            throw new Error(confirmPayload?.error?.message ?? "The upload could not be recorded.");
          }

          setViaProxy(false);
          setPhase("done");
          setPreview(confirmPayload.data.url ?? preview);
          onUploaded?.(confirmPayload.data);
          return;
        }

        // Backend cannot sign uploads: post through the application instead.
        setViaProxy(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("scope", scope);
        if (entityId) formData.append("entityId", entityId);

        const raw = await sendWithProgress("POST", "/api/admin/media/upload", formData, {});
        const payload = JSON.parse(raw);
        if (!payload.ok) throw new Error(payload?.error?.message ?? "The upload failed.");

        setPhase("done");
        setPreview(payload.data.url ?? preview);
        onUploaded?.(payload.data);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "The upload failed.";
        if (message === "cancelled") {
          setPhase("idle");
          setProgress(0);
          return;
        }
        setError(message);
        setPhase("error");
      } finally {
        requestRef.current = null;
      }
    },
    [scope, entityId, isVideo, onUploaded, preview, sendWithProgress],
  );

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  const busy = phase === "uploading" || phase === "recording" || phase === "validating";

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-card border border-dashed p-4 transition-colors",
          dragging ? "border-accent bg-accent/5" : "border-line bg-raised",
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {preview && !isVideo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Selected image preview"
              className="h-20 w-32 shrink-0 rounded border border-line object-cover"
            />
          ) : (
            <span className="flex h-20 w-32 shrink-0 items-center justify-center rounded border border-line bg-sunken text-ink-faint">
              <ImageIcon className="size-6" aria-hidden="true" />
            </span>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={accept}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-3.5" aria-hidden="true" />
                {preview ? "Replace file" : "Choose file"}
              </Button>

              {busy ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => requestRef.current?.abort()}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Cancel
                </Button>
              ) : null}

              {phase === "error" && lastFileRef.current ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void upload(lastFileRef.current!)}
                >
                  <RotateCw className="size-3.5" aria-hidden="true" />
                  Retry
                </Button>
              ) : null}
            </div>

            <p className="text-meta text-ink-muted">
              {fileInfo ? (
                <>
                  <span className="break-all">{fileInfo.name}</span> · {formatBytes(fileInfo.size)}
                </>
              ) : (
                (hint ?? "Drag a file here, or choose one.")
              )}
            </p>

            {busy ? (
              <div className="space-y-1">
                <div
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                  className="h-1 w-full overflow-hidden rounded-full bg-line"
                >
                  <span
                    className="block h-full bg-accent transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="slate flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  {phase === "validating"
                    ? "Checking file…"
                    : phase === "recording"
                      ? "Recording…"
                      : `Uploading ${progress}%`}
                </p>
              </div>
            ) : null}

            {phase === "done" ? (
              <p className="slate flex items-center gap-1.5 text-positive">
                <Check className="size-3" aria-hidden="true" />
                Uploaded{viaProxy ? " through the application (no direct upload configured)" : ""}
              </p>
            ) : null}

            {phase === "error" && error ? (
              <p role="alert" className="flex items-start gap-1.5 text-meta text-critical">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <span aria-live="polite" className="sr-only">
        {phase === "done" ? "Upload complete" : phase === "error" ? `Upload failed: ${error}` : ""}
      </span>
    </div>
  );
}
