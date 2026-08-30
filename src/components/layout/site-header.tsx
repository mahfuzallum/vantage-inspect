import { Container } from "./container";
import { BrandMark } from "./brand-mark";
import { MainNav } from "./main-nav";
import { MobileNav } from "./mobile-nav";
import { SearchBar } from "./search-bar";
import { UserMenu } from "./user-menu";
import { currentUser } from "@/lib/auth/guards";
import { siteConfig } from "@/config/site";

/**
 * Site-wide header, identical on every page. A Server Component: the session
 * is read here, and only the interactive parts (nav highlighting, search,
 * account menu, drawer) ship JavaScript.
 */
export async function SiteHeader() {
  const user = await currentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base/85 backdrop-blur-md">
      <Container className="flex h-14 items-center gap-2 sm:gap-4">
        <BrandMark label={siteConfig.shortName} />

        <MainNav className="hidden md:block" />

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <SearchBar className="hidden w-64 lg:block xl:w-80" />
          <UserMenu user={user ? { name: user.name, image: user.image, role: user.role } : null} />
          <MobileNav isSignedIn={Boolean(user)} />
        </div>
      </Container>
    </header>
  );
}
