import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/utils/hash";
import { clientIdentifier } from "@/lib/security/rate-limit";

/**
 * Administrative audit trail.
 *
 * Records who changed what, so a destructive or contested change can be traced
 * afterwards. Deliberately append-only — nothing in the application updates or
 * deletes a log row.
 *
 * Never records secrets, passwords or raw IP addresses: the client address is
 * stored only as a salted hash, which is enough to correlate a session without
 * retaining personal data.
 */

export const AUDIT_ACTIONS = {
  CONTENT_CREATED: "content.created",
  CONTENT_UPDATED: "content.updated",
  CONTENT_DELETED: "content.deleted",
  CONTENT_PUBLISHED: "content.published",
  CONTENT_UNPUBLISHED: "content.unpublished",
  CONTENT_ARCHIVED: "content.archived",
  CONTENT_FEATURED: "content.featured",
  CREATOR_CREATED: "creator.created",
  CREATOR_UPDATED: "creator.updated",
  CREATOR_DELETED: "creator.deleted",
  CATEGORY_CREATED: "category.created",
  CATEGORY_UPDATED: "category.updated",
  CATEGORY_DELETED: "category.deleted",
  TAG_CREATED: "tag.created",
  TAG_UPDATED: "tag.updated",
  TAG_DELETED: "tag.deleted",
  TAG_MERGED: "tag.merged",
  USER_SUSPENDED: "user.suspended",
  USER_REINSTATED: "user.reinstated",
  USER_ROLE_CHANGED: "user.role_changed",
  REPORT_RESOLVED: "report.resolved",
  REPORT_DISMISSED: "report.dismissed",
  SETTINGS_CHANGED: "settings.changed",
  MEDIA_DELETED: "media.deleted",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Human-readable phrasing for the feed.
 *
 * The stored value is a stable machine key and must not change — these are the
 * reading of it. Written as completed actions in the past tense, so an entry
 * reads as a sentence next to the actor's name.
 */
const ACTION_LABELS: Record<string, string> = {
  "content.created": "added a recording",
  "content.updated": "edited a recording",
  "content.deleted": "deleted a recording",
  "content.published": "published a recording",
  "content.unpublished": "moved a recording to draft",
  "content.archived": "archived a recording",
  "content.featured": "changed a featured recording",
  "creator.created": "added a creator",
  "creator.updated": "edited a creator",
  "creator.deleted": "deleted a creator",
  "category.created": "added a category",
  "category.updated": "edited a category",
  "category.deleted": "deleted a category",
  "tag.created": "added a tag",
  "tag.updated": "edited a tag",
  "tag.deleted": "deleted a tag",
  "tag.merged": "merged tags",
  "user.suspended": "suspended an account",
  "user.reinstated": "reinstated an account",
  "user.role_changed": "changed an account role",
  "report.resolved": "resolved a report",
  "report.dismissed": "dismissed a report",
  "settings.changed": "changed site settings",
  "media.deleted": "deleted a media file",
};

/** Falls back to the raw key, so a new action is never rendered as blank. */
export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

const IP_SALT = "vantage-audit";

/**
 * Writes one entry. Never throws: a logging failure must not roll back the
 * administrative action it was describing.
 */
export async function recordAudit(params: {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    let ipHash: string | null = null;
    try {
      ipHash = hashIp(clientIdentifier(await headers()), IP_SALT);
    } catch {
      // Outside a request context (a script or worker) there is no address.
    }

    await db.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        metadata: params.metadata ? (params.metadata as never) : undefined,
        ipHash,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record entry:", error);
  }
}

/** Recent entries for the dashboard and entity histories. */
export async function recentAudit(limit = 20, entityId?: string) {
  return db.auditLog.findMany({
    where: entityId ? { entityId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, displayName: true, username: true } } },
  });
}
