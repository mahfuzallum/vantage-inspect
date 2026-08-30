import "server-only";

import {
  readdir,
  rm,
  stat,
} from "node:fs/promises";

import path from "node:path";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { S3MediaProvider } from "@/lib/media/s3-provider";
import { storagePaths } from "@/lib/media/paths";

/**
 * Housekeeping for the pipeline.
 *
 * Failed uploads and abandoned scratch directories otherwise sit on disk
 * forever; a few interrupted multi-gigabyte transcodes will fill a volume.
 */

/**
 * Removes scratch directories older than the cutoff with no live job.
 */
export async function cleanupOrphanedWorkDirs(
  olderThanHours = 24,
): Promise<number> {
  const root =
    serverEnv()
      .VIDEO_WORK_DIR;

  const cutoff =
    Date.now() -
    olderThanHours *
      3_600_000;

  let removed = 0;

  let entries: string[];

  try {
    entries =
      await readdir(
        root,
      );
  } catch {
    /*
     * Nothing has been processed yet.
     */
    return 0;
  }

  for (
    const entry of entries
  ) {
    const dir =
      path.join(
        root,
        entry,
      );

    try {
      const info =
        await stat(
          dir,
        );

      if (
        !info.isDirectory() ||
        info.mtimeMs >
          cutoff
      ) {
        continue;
      }

      /*
       * Never delete scratch belonging to
       * a job that is still running.
       */
      const active =
        await db.processingJob.findFirst(
          {
            where: {
              contentId:
                entry,

              status: {
                in: [
                  "QUEUED",
                  "RUNNING",
                ],
              },
            },

            select: {
              id: true,
            },
          },
        );

      if (active) {
        continue;
      }

      await rm(
        dir,
        {
          recursive: true,
          force: true,
        },
      );

      removed += 1;
    } catch {
      /*
       * A directory disappearing mid-sweep
       * is fine.
       */
    }
  }

  console.info(
    `[cleanup] removed ${removed} orphaned work director${
      removed === 1
        ? "y"
        : "ies"
    }`,
  );

  return removed;
}

export type DeletionMode =
  | "soft"
  | "purge";

/**
 * Deletes a recording's media.
 *
 * `soft` is the default and is what a takedown or moderation decision should
 * use: the recording stops being reachable, but the bytes stay put in case the
 * decision is appealed or a legal hold applies.
 *
 * `purge` is the irreversible one and should only follow an explicit
 * retention decision.
 */
export async function deleteVideoAssets(
  contentId: string,
  mode: DeletionMode = "soft",
): Promise<{
  mode: DeletionMode;
  objectsRemoved: number;
}> {
  /*
   * Soft deletion:
   *
   * Keep all physical media.
   */
  if (
    mode === "soft"
  ) {
    await db.content.update(
      {
        where: {
          id: contentId,
        },

        data: {
          status:
            "ARCHIVED",

          hlsMasterKey:
            null,
        },
      },
    );

    console.info(
      `[cleanup] soft-deleted content=${contentId} (objects retained)`,
    );

    return {
      mode,
      objectsRemoved: 0,
    };
  }

  /*
   * Purge:
   *
   * Delete all generated storage prefixes.
   *
   * deletePrefix() returns void, so we count successful
   * prefix cleanup operations rather than adding its return
   * value as a number.
   */
  let objectsRemoved = 0;

  if (
    serverEnv()
      .MEDIA_PROVIDER ===
    "s3"
  ) {
    const store =
      new S3MediaProvider();

    for (
      const prefix of
        storagePaths.prefixes(
          contentId,
        )
    ) {
      try {
        await store.deletePrefix(
          prefix,
        );

        /*
         * deletePrefix() no longer returns the exact object count.
         * Count the completed prefix cleanup operation instead.
         */
        objectsRemoved += 1;
      } catch (error) {
        console.error(
          `[cleanup] failed to purge prefix=${prefix} content=${contentId}`,
          error,
        );
      }
    }
  }

  /*
   * Remove database-side rendition records and
   * reset processing state.
   */
  await db.$transaction([
    db.videoRendition.deleteMany(
      {
        where: {
          contentId,
        },
      },
    ),

    db.content.update(
      {
        where: {
          id: contentId,
        },

        data: {
          hlsMasterKey:
            null,

          processingStatus:
            "NONE",
        },
      },
    ),
  ]);

  console.info(
    `[cleanup] purged content=${contentId} objects=${objectsRemoved}`,
  );

  return {
    mode,
    objectsRemoved,
  };
}