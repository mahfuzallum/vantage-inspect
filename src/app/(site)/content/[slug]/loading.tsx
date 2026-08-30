import { Container } from "@/components/layout/container";
import { ContentDetailSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container className="py-6 sm:py-8">
      <ContentDetailSkeleton />
    </Container>
  );
}
