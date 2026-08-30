import { routes } from "./routes";

export type NavItem = {
  label: string;
  href: string;
  description?: string;
};

/** Primary browse rail — shown in the header and the mobile drawer. */
export const primaryNav: NavItem[] = [
  { label: "Home", href: routes.home, description: "Back to the archive home" },
  { label: "Latest", href: routes.latest, description: "Newest additions to the archive" },
  { label: "Popular", href: routes.popular, description: "Most viewed this month" },
  { label: "Featured", href: routes.featured, description: "Featured videos" },
  { label: "Categories", href: routes.categories, description: "Browse categories" },
  { label: "Creators", href: routes.creators, description: "Browse creators" },
];

export const accountNav: NavItem[] = [
  { label: "Overview", href: routes.account.root },
  { label: "Saved", href: routes.account.favorites },
  { label: "History", href: routes.account.history },
  { label: "Settings", href: routes.account.settings },
];

export const adminNav: NavItem[] = [
  { label: "Dashboard", href: routes.admin.root },
  { label: "Home page", href: routes.admin.home },
  { label: "Content", href: routes.admin.content },
  { label: "Creators", href: routes.admin.creators },
  { label: "Categories", href: routes.admin.categories },
  { label: "Tags", href: routes.admin.tags },
  { label: "Users", href: routes.admin.users },
  { label: "Reports", href: routes.admin.reports },
  { label: "Media", href: routes.admin.media },
  { label: "Processing", href: routes.admin.jobs },
  { label: "SEO", href: routes.admin.seo },
  { label: "Settings", href: routes.admin.settings },
];

export const footerNav: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: "Browse",
    items: [
      { label: "Latest", href: routes.latest },
      { label: "Popular", href: routes.popular },
      { label: "Featured", href: routes.featured },
      { label: "Subjects", href: routes.categories },
      { label: "Topics", href: routes.tags },
      { label: "Contributors", href: routes.creators },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Sign in", href: routes.auth.login },
      { label: "Create account", href: routes.auth.register },
      { label: "Saved items", href: routes.account.favorites },
      { label: "Watch history", href: routes.account.history },
    ],
  },
  {
    heading: "Archive",
    items: [
      { label: "About", href: routes.legal.about },
      { label: "Contact", href: routes.legal.contact },
    ],
  },
  {
    heading: "Legal",
    items: [
      { label: "Privacy", href: routes.legal.privacy },
      { label: "Terms", href: routes.legal.terms },
      { label: "Copyright", href: routes.legal.copyright },
    ],
  },
];
