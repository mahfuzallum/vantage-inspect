"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { AUDIT_ACTIONS, recordAudit } from "@/server/services/audit-service";
import {
  adminReportSchema,
  adminRoleChangeSchema,
  adminUserActionSchema,
} from "@/validation/admin";
import { routes } from "@/config/routes";
import type { AdminFormState } from "./admin-content";

/**
 * User and report administration.
 *
 * Two rules run through this file: the acting administrator always comes from
 * the session, and the target is always looked up server-side before anything
 * is written. A forged id in a payload cannot escalate anyone's privileges.
 */

/** Suspending sets `isActive = false`; the credentials provider then refuses sign-in. */
export async function setUserStatusAction(
  userId: string,
  action: "suspend" | "reinstate",
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();

  const parsed = adminUserActionSchema.safeParse({ userId, action });
  if (!parsed.success) return { ok: false, message: "Unknown account." };

  // An administrator locking themselves out would leave no way back in.
  if (parsed.data.userId === admin.id) {
    return { ok: false, message: "You cannot suspend your own account." };
  }

  try {
    const target = await db.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, username: true, role: true },
    });
    if (!target) return { ok: false, message: "That account no longer exists." };

    const suspending = parsed.data.action === "suspend";

    await db.$transaction([
      db.user.update({
        where: { id: target.id },
        data: { isActive: !suspending },
      }),
      // Suspension also drops persisted sessions, so access ends immediately
      // rather than at the next token expiry.
      db.session.deleteMany({ where: { userId: target.id } }),
    ]);

    await recordAudit({
      actorId: admin.id,
      action: suspending ? AUDIT_ACTIONS.USER_SUSPENDED : AUDIT_ACTIONS.USER_REINSTATED,
      entityType: "user",
      entityId: target.id,
      metadata: { username: target.username },
    });

    revalidatePath(routes.admin.users);
    revalidatePath(routes.admin.userDetail(target.id));
    return { ok: true, message: suspending ? "Account suspended." : "Account reinstated." };
  } catch (error) {
    console.error("[admin] user status change failed:", error);
    return { ok: false, message: "That didn't complete. Try again." };
  }
}

/** Role changes are ADMIN-only and always audited. */
export async function setUserRoleAction(
  userId: string,
  role: "USER" | "MODERATOR" | "ADMIN",
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();

  const parsed = adminRoleChangeSchema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, message: "Unknown account or role." };

  if (parsed.data.userId === admin.id) {
    return { ok: false, message: "You cannot change your own role." };
  }

  try {
    const target = await db.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, username: true, role: true },
    });
    if (!target) return { ok: false, message: "That account no longer exists." };

    // Never remove the last administrator.
    if (target.role === "ADMIN" && parsed.data.role !== "ADMIN") {
      const admins = await db.user.count({ where: { role: "ADMIN", isActive: true } });
      if (admins <= 1) {
        return {
          ok: false,
          message: "This is the only administrator. Promote someone else first.",
        };
      }
    }

    await db.user.update({ where: { id: target.id }, data: { role: parsed.data.role } });

    await recordAudit({
      actorId: admin.id,
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      entityType: "user",
      entityId: target.id,
      metadata: { username: target.username, from: target.role, to: parsed.data.role },
    });

    revalidatePath(routes.admin.userDetail(target.id));
    return { ok: true, message: `Role set to ${parsed.data.role}.` };
  } catch (error) {
    console.error("[admin] role change failed:", error);
    return { ok: false, message: "That didn't complete. Try again." };
  }
}

// ---------------------------------------------------------------- reports

export async function updateReportAction(
  reportId: string,
  _previous: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await requireStaff();

  const parsed = adminReportSchema.safeParse({
    reportId,
    status: formData.get("status"),
    handlerNote: formData.get("handlerNote") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: "Check the form and try again." };

  try {
    const existing = await db.report.findUnique({
      where: { id: parsed.data.reportId },
      select: { id: true, status: true },
    });
    if (!existing) return { status: "error", message: "That report no longer exists." };

    const resolved = parsed.data.status === "RESOLVED" || parsed.data.status === "DISMISSED";

    await db.report.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.status,
        // Internal only — never rendered on any public route.
        handlerNote: parsed.data.handlerNote ?? null,
        handlerId: admin.id,
        resolvedAt: resolved ? new Date() : null,
      },
    });

    await recordAudit({
      actorId: admin.id,
      action:
        parsed.data.status === "DISMISSED"
          ? AUDIT_ACTIONS.REPORT_DISMISSED
          : AUDIT_ACTIONS.REPORT_RESOLVED,
      entityType: "report",
      entityId: existing.id,
      metadata: { from: existing.status, to: parsed.data.status },
    });
  } catch (error) {
    console.error("[admin] report update failed:", error);
    return { status: "error", message: "That didn't save. Try again." };
  }

  revalidatePath(routes.admin.reports);
  revalidatePath(routes.admin.reportDetail(reportId));
  return { status: "success", message: "Report updated." };
}
