import { RouteStub } from "@/components/layout/route-stub";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Copyright and takedowns",
  description: "How rights holders can report material and request its removal.",
  path: routes.legal.copyright,
});

export default function CopyrightPage() {
  return (
    <RouteStub
      eyebrow="Legal"
      title="Copyright and takedowns"
      summary="How rights holders can report material and request its removal. The route, navigation entry and metadata are live; the copy itself is written later."
    />
  );
}
