import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireStaff } from "@/lib/auth/guards";

export const metadata = { robots: { index: false, follow: false } };

/**
 * Admin shell.
 *
 * A Server Component, and the role is resolved here as well as in middleware —
 * an unauthorised visitor never receives the markup at all, rather than
 * receiving it and having it hidden by client code.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AdminSidebar
        user={{ name: staff.name ?? staff.username, role: staff.role, image: staff.image }}
      />

      <main id="main" className="min-w-0 flex-1 pb-16">
        {children}
      </main>
    </div>
  );
}
