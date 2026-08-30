import { RouteStub } from "@/components/layout/route-stub";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Contact",
  description: "How to reach the archive team about material, corrections or access requests.",
  path: routes.legal.contact,
});

export default function ContactPage() {
  return (
    <RouteStub
      eyebrow="Archive"
      title="Contact"
      summary="How to reach the archive team about material, corrections or access requests. The route, navigation entry and metadata are live; the copy itself is written later."
    />
  );
}
