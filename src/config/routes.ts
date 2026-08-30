/**
 * Single source of truth for every internal URL.
 * Components link through these helpers so a route rename is one edit.
 */
export const routes = {
  home: "/",
  latest: "/latest",
  popular: "/popular",
  featured: "/featured",
  search: (query?: string) => (query ? `/search?q=${encodeURIComponent(query)}` : "/search"),
  categories: "/categories",
  category: (slug: string) => `/category/${slug}`,
  tags: "/tags",
  tag: (slug: string) => `/tag/${slug}`,
  creators: "/creators",
  creator: (slug: string) => `/creator/${slug}`,
  content: (slug: string) => `/content/${slug}`,

  auth: {
    login: "/auth/login",
    register: "/auth/register",
    forgotPassword: "/auth/forgot-password",
    resetPassword: (token?: string) =>
      token ? `/auth/reset-password?token=${encodeURIComponent(token)}` : "/auth/reset-password",
    logout: "/auth/logout",
  },

  account: {
    root: "/account",
    settings: "/account/settings",
    password: "/account/settings/password",
    delete: "/account/settings/delete",
    favorites: "/account/favorites",
    history: "/account/history",
  },

  admin: {
    root: "/admin",
    content: "/admin/content",
    contentNew: "/admin/content/new",
    contentEdit: (id: string) => `/admin/content/${id}/edit`,
    creators: "/admin/creators",
    creatorNew: "/admin/creators/new",
    creatorEdit: (id: string) => `/admin/creators/${id}/edit`,
    categories: "/admin/categories",
    categoryNew: "/admin/categories/new",
    categoryEdit: (id: string) => `/admin/categories/${id}/edit`,
    tags: "/admin/tags",
    tagNew: "/admin/tags/new",
    tagEdit: (id: string) => `/admin/tags/${id}/edit`,
    media: "/admin/media",
    mediaUpload: "/admin/media/upload",
    mediaOrphans: "/admin/media/orphans",
    jobs: "/admin/jobs",
    users: "/admin/users",
    userDetail: (id: string) => `/admin/users/${id}`,
    reports: "/admin/reports",
    reportDetail: (id: string) => `/admin/reports/${id}`,
    settings: "/admin/settings",
    home: "/admin/home",
    seo: "/admin/seo",
  },

  legal: {
    about: "/about",
    terms: "/terms",
    privacy: "/privacy",
    copyright: "/copyright",
    contact: "/contact",
  },
} as const;

/**
 * Builds a sign-in link that returns the reader to where they were headed.
 * The destination is re-validated server-side before any redirect happens —
 * see `safeRedirectPath` — so this cannot be used as an open redirect.
 */
export function loginWithCallback(destination: string): string {
  return `/auth/login?callbackUrl=${encodeURIComponent(destination)}`;
}

/** Prefixes that require an authenticated session. */
export const PROTECTED_PREFIXES = ["/account"] as const;

/** Prefixes that require an ADMIN or MODERATOR role. */
export const ADMIN_PREFIXES = ["/admin"] as const;

/** Signed-in users are bounced away from these. */
export const GUEST_ONLY_PREFIXES = ["/auth/login", "/auth/register"] as const;
