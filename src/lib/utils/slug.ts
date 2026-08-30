/** URL-safe slug: lowercase, accent-stripped, hyphen-separated. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/**
 * Appends a numeric suffix until the slug is free.
 * `exists` is injected so this stays testable and storage-agnostic.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || "item";
  if (!(await exists(root))) return root;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
