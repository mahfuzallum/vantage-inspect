import { getSettings } from "@/server/services/settings-service";
import { MonetizationCode } from "./monetization-code";

export async function MonetizationRuntime() {
  const s = await getSettings("monetization");
  return (
    <>
      {Boolean(s.popunderEnabled && typeof s.popunderCode === "string" && s.popunderCode.trim()) ? (
        <MonetizationCode code={String(s.popunderCode)} />
      ) : null}
      {Boolean(s.socialBarEnabled && typeof s.socialBarCode === "string" && s.socialBarCode.trim()) ? (
        <MonetizationCode code={String(s.socialBarCode)} />
      ) : null}
      {Boolean(s.bodyAdEnabled && typeof s.bodyAdCode === "string" && s.bodyAdCode.trim()) ? (
        <MonetizationCode code={String(s.bodyAdCode)} />
      ) : null}
    </>
  );
}
