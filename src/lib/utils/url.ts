/**
 * Query-string helpers shared by the filter controls and by every link that
 * has to preserve the current browse state.
 *
 * The rules encoded here: default values are omitted rather than written out
 * (so `/search?q=design` stays clean), and any change to a filter resets the
 * page — showing page 7 of a result set that now has two pages is a bug.
 */

export type ParamValue = string | number | null | undefined;

/** Builds `path?a=1&b=2`, dropping empty values and stable-ordering keys. */
export function buildUrl(path: string, params: Record<string, ParamValue>): string {
  const search = new URLSearchParams();

  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Current params as a plain object, for spreading into buildUrl. */
export function paramsToObject(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(params.entries());
}

/**
 * Applies a filter change: sets or clears one key and always drops `page`.
 */
export function withParam(
  params: URLSearchParams,
  key: string,
  value: ParamValue,
): Record<string, string | undefined> {
  const next = paramsToObject(params) as Record<string, string | undefined>;

  if (value === null || value === undefined || value === "") delete next[key];
  else next[key] = String(value);

  delete next.page;
  return next;
}
