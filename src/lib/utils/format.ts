/** Seconds -> timecode. Under an hour: M:SS. Otherwise H:MM:SS. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Compact counts for dense card metadata: 1.2K, 3.4M. */
export function formatCount(value: number | null | undefined): string {
  const n = value ?? 0;
  if (n < 1000) return String(n);
  const units = [
    { limit: 1_000_000_000, suffix: "B" },
    { limit: 1_000_000, suffix: "M" },
    { limit: 1_000, suffix: "K" },
  ];
  for (const { limit, suffix } of units) {
    if (n >= limit) {
      const scaled = n / limit;
      return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return String(n);
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  const deltaSeconds = Math.round((value.getTime() - Date.now()) / 1000);
  const abs = Math.abs(deltaSeconds);
  for (const [unit, secondsPerUnit] of STEPS) {
    if (abs >= secondsPerUnit) {
      return RELATIVE.format(Math.round(deltaSeconds / secondsPerUnit), unit);
    }
  }
  return RELATIVE.format(deltaSeconds, "second");
}

const ABSOLUTE = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return ABSOLUTE.format(typeof date === "string" ? new Date(date) : date);
}

/**
 * Count with a correctly pluralised noun: "1 item", "24 items".
 * Irregular plurals are passed explicitly rather than guessed.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`);
  return `${count.toLocaleString()} ${noun}`;
}
