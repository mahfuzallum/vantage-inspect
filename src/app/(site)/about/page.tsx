import { RouteStub } from "@/components/layout/route-stub";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "About the archive",
  description: "What this archive collects, how material is selected, and who maintains it.",
  path: routes.legal.about,
});

export default function AboutPage() {
  return (
    <RouteStub
      eyebrow="Archive"
      title="About the archive"
      summary="What this archive collects, how material is selected, and who maintains it. The route, navigation entry and metadata are live; the copy itself is written later."
    />
  );
}
