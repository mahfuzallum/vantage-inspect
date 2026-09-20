import Link from "next/link";

import RequestModelForm from "./request-model-form";

import { Container } from "@/components/layout/container";
import { buildMetadata } from "@/lib/seo/metadata";
import { routes } from "@/config/routes";

export const metadata = buildMetadata({
  title: "Request a Model",
  description:
    "Request a creator or model to be considered for the Vantage Archive.",
  path: routes.requestModel,
});

export default function RequestModelPage() {
  return (
    <main className="min-h-screen">
      <Container className="py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8">
            <div className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.16em] text-accent">
              Community Request
            </div>

            <h1 className="font-display text-page font-semibold tracking-tight text-ink">
              Request a Model
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted sm:text-base">
              Know a creator or model we should archive?
              Send us their public profile and we will
              review the request.
            </p>
          </div>

          <RequestModelForm />

          <div className="mt-6 text-center">
            <Link
              href={routes.home}
              className="text-sm text-ink-muted transition hover:text-accent"
            >
              ← Back to the archive
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}