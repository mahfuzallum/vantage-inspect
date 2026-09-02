import { getSettings } from "@/server/services/settings-service";
import { MonetizationCode } from "./monetization-code";

export type MonetizationPlacement = "home" | "listing" | "video";

export async function MonetizationSlot({
  type,
  placement,
  className = "",
}: {
  type: "nativeBanner" | "banner";
  placement: MonetizationPlacement;
  className?: string;
}) {
  const s = await getSettings("monetization");
  const enabled = Boolean(s[`${type}Enabled`]);
  const code = typeof s[`${type}Code`] === "string" ? String(s[`${type}Code`]) : "";
  const configuredPlacement = String(s[`${type}Placement`] ?? "home");
  if (!enabled || !code.trim() || configuredPlacement !== placement) return null;
  return (
    <div className={`my-5 w-full ${className}`.trim()} data-monetization-slot={type}>
      <MonetizationCode code={code} />
    </div>
  );
}
