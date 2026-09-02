import { NextResponse } from "next/server";
import { getSettings } from "@/server/services/settings-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSettings("monetization");
  return NextResponse.json({
    smartLinkEnabled: Boolean(s.smartLinkEnabled),
    smartLinkUrl: typeof s.smartLinkUrl === "string" ? s.smartLinkUrl : "",
    smartLinkTriggerCount: Number(s.smartLinkTriggerCount ?? 2),
    smartLinkTriggerMode: s.smartLinkTriggerMode === "random_2_3" ? "random_2_3" : "fixed",
  }, { headers: { "Cache-Control": "no-store" } });
}
