import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { AdminPageHeader, FormSection } from "@/components/admin/admin-shell";
import { UserAdminControls } from "@/components/admin/user-controls";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { requireStaff } from "@/lib/auth/guards";
import { getAdminUser } from "@/server/services/admin-service";
import { formatDate, formatRelativeTime } from "@/lib/utils/format";
import { routes } from "@/config/routes";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  const user = await getAdminUser(id);
  if (!user) notFound();

  return (
    <Container className="max-w-3xl space-y-6 py-8">
      <AdminPageHeader
        title={user.displayName}
        breadcrumb={{ label: "Users", href: routes.admin.users }}
        description={`@${user.username}`}
      />

      <FormSection title="Account">
        <div className="flex items-start gap-4">
          <Avatar name={user.displayName} src={user.avatarUrl} size="lg" />
          {/*
            Only account facts. No password hash, no session token, no reset
            token — the admin UI has no legitimate use for any of them.
          */}
          <dl className="grid flex-1 gap-x-6 gap-y-2 text-meta sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-ink-muted">Email</dt>
              <dd className="min-w-0 truncate text-ink">{user.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">Verified</dt>
              <dd className="text-ink">
                {user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : "Not verified"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">Registered</dt>
              <dd className="text-ink">{formatDate(user.createdAt)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">Last sign-in</dt>
              <dd className="text-ink">
                {user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : "Never"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">Saved</dt>
              <dd className="tabular-nums text-ink">{user._count.favorites}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">History</dt>
              <dd className="tabular-nums text-ink">{user._count.history}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Badge tone={user.isActive ? "positive" : "critical"}>
            {user.isActive ? "Active" : "Suspended"}
          </Badge>
          <Badge tone={user.role === "ADMIN" ? "accent" : "neutral"}>{user.role}</Badge>
        </div>

        {user.bio ? <p className="text-meta leading-relaxed text-ink-muted">{user.bio}</p> : null}
      </FormSection>

      {/* Administrative actions are ADMIN-only; moderators get a read-only view. */}
      {staff.role === "ADMIN" ? (
        <FormSection
          title="Administration"
          description="Suspension ends any active session immediately."
        >
          <UserAdminControls
            userId={user.id}
            username={user.username}
            isActive={user.isActive}
            role={user.role}
            isSelf={user.id === staff.id}
          />
        </FormSection>
      ) : null}

      <FormSection title="Reports filed" description="Reports submitted by this account.">
        {user.reportsFiled.length === 0 ? (
          <p className="text-meta text-ink-muted">None.</p>
        ) : (
          <ul className="space-y-2">
            {user.reportsFiled.map((report) => (
              <li key={report.id} className="flex items-center justify-between gap-3 text-meta">
                <span className="text-ink-muted">
                  <span className="font-mono text-2xs text-accent">{report.reason}</span>{" "}
                  {formatRelativeTime(report.createdAt)}
                </span>
                <Badge tone={report.status === "RESOLVED" ? "positive" : "neutral"}>
                  {report.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </Container>
  );
}
