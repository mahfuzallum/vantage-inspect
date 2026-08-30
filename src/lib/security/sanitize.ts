/**
 * Escapes the five XML-significant characters. React escapes interpolated
 * values already — use this only where a string is written into markup by
 * hand (structured data, sitemap, RSS).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapse whitespace and cap length for free-text search input. */
export function normalizeQuery(raw: string | null | undefined, maxLength = 120): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Reject javascript:/data: URLs before they reach an href or media source. */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Only allow same-origin relative paths as post-login redirects, which
 * closes the open-redirect hole in `?next=`.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
