import { RouteStub } from "@/components/layout/route-stub";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Terms of use",
  description: "The terms that apply to browsing and reusing material from the archive.",
  path: routes.legal.terms,
});

export default function TermsPage() {
  return (
    <RouteStub
      eyebrow="Legal"
      title="Terms of use"
      summary="The terms that apply to browsing and reusing material from the archive. The route, navigation entry and metadata are live; the copy itself is written later."
    />
  );
}
