import { RouteStub } from "@/components/layout/route-stub";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Privacy",
  description: "What the archive records about readers and how long it is kept.",
  path: routes.legal.privacy,
});

export default function PrivacyPage() {
  return (
    <RouteStub
      eyebrow="Legal"
      title="Privacy"
      summary="What the archive records about readers and how long it is kept. The route, navigation entry and metadata are live; the copy itself is written later."
    />
  );
}
