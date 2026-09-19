import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { revalidateTag } from "next/cache";

import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env";

import {
  S3MediaProvider,
  type S3ProviderConfig,
} from "@/lib/media/s3-provider";

import { LocalMediaProvider } from "@/lib/media/local-provider";

import type {
  MediaStorageProvider,
} from "@/lib/media/types";

export type StorageProfile = {
  id: string;
  name: string;
  type: "local" | "s3";
  endpoint: string | null;
  region: string;
  bucket: string | null;
  publicUrl: string | null;
  forcePathStyle: boolean;
  enabled: boolean;
  accessKey?: string;
  secretKey?: string;
};

type StoredProfile = Omit<
  StorageProfile,
  "accessKey" | "secretKey"
> & {
  accessKey?: string;
  secretKey?: string;
};

const SETTING_KEY = "storageProfiles";
const ACTIVE_KEY = "activeStorageProfile";
const VERSION = 1;

/**
 * Derive a stable encryption key from AUTH_SECRET.
 */
function keyMaterial(): Buffer {
  return createHash("sha256")
    .update(serverEnv().AUTH_SECRET)
    .digest();
}

/**
 * Encrypt a storage credential before it is stored in SiteSetting.
 */
function encrypt(value: string): string {
  const iv = randomBytes(12);

  const cipher = createCipheriv(
    "aes-256-gcm",
    keyMaterial(),
    iv,
  );

  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a storage credential.
 */
function decrypt(value: string): string {
  const [
    version,
    ivText,
    tagText,
    dataText,
  ] = value.split(".");

  if (
    version !== String(VERSION) ||
    !ivText ||
    !tagText ||
    !dataText
  ) {
    throw new Error(
      "Invalid encrypted storage secret.",
    );
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyMaterial(),
    Buffer.from(ivText, "base64url"),
  );

  decipher.setAuthTag(
    Buffer.from(tagText, "base64url"),
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(
        dataText,
        "base64url",
      ),
    ),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Read all storage profiles from the database.
 */
async function readProfiles(): Promise<StoredProfile[]> {
  const row =
    await db.siteSetting.findUnique({
      where: {
        key: SETTING_KEY,
      },
      select: {
        value: true,
      },
    });

  if (!Array.isArray(row?.value)) {
    return [];
  }

  return (
    row.value as StoredProfile[]
  ).map((profile) => ({
    ...profile,
  }));
}

/**
 * Save the complete storage profile list.
 */
async function writeProfiles(
  profiles: StoredProfile[],
): Promise<void> {
  await db.siteSetting.upsert({
    where: {
      key: SETTING_KEY,
    },

    create: {
      key: SETTING_KEY,
      group: "storage",
      value: profiles as never,
    },

    update: {
      value: profiles as never,
      group: "storage",
    },
  });

  revalidateTag("settings");
}

/**
 * Return storage profiles for Admin Settings.
 *
 * Secrets are never returned to the client.
 */
export async function getStorageProfiles(): Promise<
  StorageProfile[]
> {
  const profiles =
    await readProfiles();

  return profiles.map(
    (profile) => ({
      ...profile,

      accessKey: profile.accessKey
        ? "••••••••"
        : undefined,

      secretKey: profile.secretKey
        ? "••••••••"
        : undefined,
    }),
  );
}

/**
 * Return the currently active and enabled storage profile.
 */
export async function getActiveStorageProfile(): Promise<
  StorageProfile | null
> {
  const profiles =
    await readProfiles();

  const active =
    await db.siteSetting.findUnique({
      where: {
        key: ACTIVE_KEY,
      },
      select: {
        value: true,
      },
    });

  const activeId =
    typeof active?.value === "string"
      ? active.value
      : null;

  const profile =
    profiles.find(
      (item) =>
        item.id === activeId &&
        item.enabled,
    );

  return profile
    ? {
        ...profile,
      }
    : null;
}

/**
 * Convert a stored profile into an S3 provider config.
 */
function toProviderConfig(
  profile: StoredProfile,
): S3ProviderConfig {
  if (profile.type !== "s3") {
    throw new Error(
      "This storage profile is not S3-compatible.",
    );
  }

  if (
    !profile.endpoint ||
    !profile.bucket ||
    !profile.accessKey ||
    !profile.secretKey
  ) {
    throw new Error(
      "Storage profile is missing endpoint, bucket or credentials.",
    );
  }

  return {
    endpoint: profile.endpoint,
    region:
      profile.region || "auto",
    bucket: profile.bucket,

    accessKey: decrypt(
      profile.accessKey,
    ),

    secretKey: decrypt(
      profile.secretKey,
    ),

    publicUrl:
      profile.publicUrl,

    forcePathStyle:
      profile.forcePathStyle,
  };
}

/**
 * Return the media provider configured in Admin Settings.
 *
 * If no Admin storage profile is active, fall back to .env.
 */
export async function getConfiguredMediaProvider(): Promise<
  MediaStorageProvider
> {
  const env = serverEnv();

  if (env.MEDIA_PROVIDER === "s3") {
    return new S3MediaProvider();
  }

  return new LocalMediaProvider();
}

/**
 * Find the correct provider for an existing media asset.
 *
 * This allows old assets to continue working even after the
 * active storage profile is changed.
 */
export async function getMediaProviderForAsset(
  asset: {
    provider: string;
    bucket?: string | null;
  },
): Promise<MediaStorageProvider> {
  if (
    asset.provider !== "S3" ||
    !asset.bucket
  ) {
    return getConfiguredMediaProvider();
  }

  const profiles =
    await readProfiles();

  const match =
    profiles.find(
      (profile) =>
        profile.type === "s3" &&
        profile.bucket ===
          asset.bucket &&
        profile.enabled,
    );

  if (match) {
    return new S3MediaProvider(
      toProviderConfig(match),
    );
  }

  return getConfiguredMediaProvider();
}

/**
 * Add a new storage profile or update an existing one.
 */
export async function saveStorageProfile(
  input: {
    id?: string;
    name: string;
    type: "local" | "s3";

    endpoint?: string;
    region?: string;
    bucket?: string;

    accessKey?: string;
    secretKey?: string;

    publicUrl?: string;

    forcePathStyle?: boolean;
    enabled?: boolean;
    makeActive?: boolean;
  },
): Promise<void> {
  const profiles =
    await readProfiles();

  const id =
    input.id ||
    `storage_${randomBytes(8).toString("hex")}`;

  const previous =
    profiles.find(
      (profile) =>
        profile.id === id,
    );

  const profile: StoredProfile = {
    id,

    name:
      input.name.trim(),

    type:
      input.type,

    endpoint:
      input.type === "s3"
        ? input.endpoint?.trim() || null
        : null,

    region:
      input.region?.trim() || "auto",

    bucket:
      input.type === "s3"
        ? input.bucket?.trim() || null
        : null,

    publicUrl:
      input.type === "s3"
        ? input.publicUrl?.trim() || null
        : null,

    forcePathStyle:
      Boolean(
        input.forcePathStyle,
      ),

    enabled:
      input.enabled !== false,

    /*
     * Keep old encrypted credentials when
     * editing a profile without entering new ones.
     */
    accessKey:
      input.accessKey?.trim()
        ? encrypt(
            input.accessKey.trim(),
          )
        : previous?.accessKey,

    secretKey:
      input.secretKey?.trim()
        ? encrypt(
            input.secretKey.trim(),
          )
        : previous?.secretKey,
  };

  const next =
    previous
      ? profiles.map(
          (item) =>
            item.id === id
              ? profile
              : item,
        )
      : [
          ...profiles,
          profile,
        ];

  await writeProfiles(next);

  /*
   * New first storage automatically becomes active.
   */
  if (
    input.makeActive ||
    (!previous &&
      next.length === 1)
  ) {
    await db.siteSetting.upsert({
      where: {
        key: ACTIVE_KEY,
      },

      create: {
        key: ACTIVE_KEY,
        group: "storage",
        value: id,
      },

      update: {
        value: id,
      },
    });

    revalidateTag("settings");

    return;
  }

  /*
   * If an active profile was edited and disabled,
   * automatically choose another enabled profile.
   */
  const active =
    await db.siteSetting.findUnique({
      where: {
        key: ACTIVE_KEY,
      },
      select: {
        value: true,
      },
    });

  if (
    active?.value === id &&
    !profile.enabled
  ) {
    const replacement =
      next.find(
        (item) =>
          item.enabled &&
          item.id !== id,
      );

    if (replacement) {
      await db.siteSetting.upsert({
        where: {
          key: ACTIVE_KEY,
        },

        create: {
          key: ACTIVE_KEY,
          group: "storage",
          value: replacement.id,
        },

        update: {
          value: replacement.id,
        },
      });
    } else {
      await db.siteSetting.deleteMany({
        where: {
          key: ACTIVE_KEY,
        },
      });
    }

    revalidateTag("settings");
  }
}

/**
 * Make an enabled storage profile active.
 */
export async function setActiveStorageProfile(
  id: string,
): Promise<void> {
  const profiles =
    await readProfiles();

  const profile =
    profiles.find(
      (item) =>
        item.id === id &&
        item.enabled,
    );

  if (!profile) {
    throw new Error(
      "Storage profile is missing or disabled.",
    );
  }

  await db.siteSetting.upsert({
    where: {
      key: ACTIVE_KEY,
    },

    create: {
      key: ACTIVE_KEY,
      group: "storage",
      value: id,
    },

    update: {
      value: id,
    },
  });

  revalidateTag("settings");
}

/**
 * Delete a storage profile.
 *
 * If the profile is currently active:
 *
 * 1. Delete it from the profile list.
 * 2. Automatically activate another enabled profile.
 * 3. If none exists, remove ACTIVE_KEY so the app
 *    falls back to the .env configuration.
 *
 * IMPORTANT:
 * This only removes the Admin storage configuration.
 * It does NOT delete objects/files from the bucket.
 */
export async function deleteStorageProfile(
  id: string,
): Promise<void> {
  const profiles =
    await readProfiles();

  const exists =
    profiles.some(
      (profile) =>
        profile.id === id,
    );

  if (!exists) {
    return;
  }

  const active =
    await db.siteSetting.findUnique({
      where: {
        key: ACTIVE_KEY,
      },
      select: {
        value: true,
      },
    });

  const deletingActive =
    active?.value === id;

  const nextProfiles =
    profiles.filter(
      (profile) =>
        profile.id !== id,
    );

  /*
   * First remove the profile.
   */
  await writeProfiles(
    nextProfiles,
  );

  /*
   * Nothing else to do if this wasn't active.
   */
  if (!deletingActive) {
    return;
  }

  /*
   * Pick the first enabled profile as replacement.
   */
  const replacement =
    nextProfiles.find(
      (profile) =>
        profile.enabled,
    );

  if (replacement) {
    await db.siteSetting.upsert({
      where: {
        key: ACTIVE_KEY,
      },

      create: {
        key: ACTIVE_KEY,
        group: "storage",
        value: replacement.id,
      },

      update: {
        value: replacement.id,
      },
    });
  } else {
    /*
     * No Admin storage remains.
     *
     * Removing ACTIVE_KEY makes the application
     * fall back to MEDIA_PROVIDER / STORAGE_*
     * from .env.
     */
    await db.siteSetting.deleteMany({
      where: {
        key: ACTIVE_KEY,
      },
    });
  }

  revalidateTag("settings");
}

/**
 * Test an S3-compatible storage configuration
 * before saving it.
 */
export async function testStorageProfile(
  input: {
    type: "local" | "s3";

    endpoint?: string;
    region?: string;
    bucket?: string;

    accessKey?: string;
    secretKey?: string;

    publicUrl?: string;

    forcePathStyle?: boolean;
  },
): Promise<void> {
  if (
    input.type === "local"
  ) {
    return;
  }

  const provider =
    new S3MediaProvider({
      endpoint:
        input.endpoint?.trim() ||
        "",

      region:
        input.region?.trim() ||
        "auto",

      bucket:
        input.bucket?.trim() ||
        "",

      accessKey:
        input.accessKey?.trim() ||
        "",

      secretKey:
        input.secretKey?.trim() ||
        "",

      publicUrl:
        input.publicUrl?.trim() ||
        null,

      forcePathStyle:
        Boolean(
          input.forcePathStyle,
        ),
    });

  await provider.testConnection();
}

/**
 * Return the ID of the currently selected storage profile.
 */
export async function getActiveStorageId(): Promise<
  string | null
> {
  const row =
    await db.siteSetting.findUnique({
      where: {
        key: ACTIVE_KEY,
      },
      select: {
        value: true,
      },
    });

  return typeof row?.value === "string"
    ? row.value
    : null;
}