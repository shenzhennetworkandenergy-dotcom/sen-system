import "server-only";

import type { AccountRole } from "@/lib/constants/routes";
import type { ArchiveEntityType } from "@/lib/deletion/policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TrashEntrySnapshot = {
  id: string;
  entity_type: ArchiveEntityType;
  entity_id: string;
  display_name: string;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  archived_by: string | null;
  archived_at: string;
  purge_token?: string | null;
  purge_started_by?: string | null;
  purge_started_at?: string | null;
};

type TrashActor = {
  id: string;
  role: AccountRole;
};

function safeDatabaseMessage(
  displayName: string,
  error: { message?: string } | null,
) {
  const message = String(error?.message ?? "");
  const known = [
    "protected",
    "assigned to",
    "already being deleted",
    "no longer exists",
    "not supported",
  ];
  const detail = known.some((fragment) =>
    message.toLowerCase().includes(fragment),
  )
    ? message
    : "Permanent deletion could not be completed.";
  return `${displayName}: ${detail}`;
}

async function finalizeClaimedUser(
  entry: TrashEntrySnapshot,
  actor: TrashActor,
  purgeToken: string,
) {
  const db = createSupabaseAdminClient();
  const finalized = await db.rpc("admin_finalize_trash_user_purge", {
    actor_profile_id: actor.id,
    requested_entry_id: entry.id,
    requested_purge_token: purgeToken,
  });
  if (finalized.error) {
    throw new Error(
      `${entry.display_name}: the account was deleted, but Trash Bin finalization requires attention.`,
    );
  }
}

async function deleteUser(entry: TrashEntrySnapshot, actor: TrashActor) {
  const db = createSupabaseAdminClient();
  const existingProfile = await db
    .from("profiles")
    .select("id")
    .eq("id", entry.entity_id)
    .maybeSingle();
  if (existingProfile.error) {
    throw new Error(
      `${entry.display_name}: the user account could not be checked.`,
    );
  }

  if (!existingProfile.data && entry.purge_token) {
    await finalizeClaimedUser(entry, actor, entry.purge_token);
    return;
  }

  if (entry.purge_token) {
    const claimAge = entry.purge_started_at
      ? Date.now() - new Date(entry.purge_started_at).getTime()
      : 0;
    if (claimAge < 15 * 60 * 1_000) {
      throw new Error(
        `${entry.display_name}: permanent deletion is already in progress.`,
      );
    }
    const released = await db.rpc("admin_release_trash_user_purge", {
      actor_profile_id: actor.id,
      requested_entry_id: entry.id,
      requested_purge_token: entry.purge_token,
    });
    if (released.error) {
      throw new Error(
        `${entry.display_name}: an earlier deletion claim could not be released.`,
      );
    }
  }

  const dependencyChecks = await Promise.all([
    db
      .from("sales_orders")
      .select("id", { count: "exact", head: true })
      .or(
        `customer_profile_id.eq.${entry.entity_id},created_by.eq.${entry.entity_id},updated_by.eq.${entry.entity_id}`,
      ),
    db
      .from("products")
      .select("id", { count: "exact", head: true })
      .or(`created_by.eq.${entry.entity_id},updated_by.eq.${entry.entity_id}`),
    db
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("initiated_by", entry.entity_id),
    db
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .or(`created_by.eq.${entry.entity_id},updated_by.eq.${entry.entity_id}`),
    db
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .or(`created_by.eq.${entry.entity_id},posted_by.eq.${entry.entity_id}`),
  ]);
  if (
    dependencyChecks.some(
      (result) => result.error || (result.count ?? 0) > 0,
    )
  ) {
    throw new Error(
      `${entry.display_name}: the account owns protected operational history and cannot be permanently deleted.`,
    );
  }

  const prepared = await db.rpc("admin_prepare_trash_user_purge", {
    actor_profile_id: actor.id,
    requested_entry_id: entry.id,
  });
  if (prepared.error || !prepared.data) {
    throw new Error(safeDatabaseMessage(entry.display_name, prepared.error));
  }
  const purgeToken = String(prepared.data);

  const authDeletion = await db.auth.admin.deleteUser(entry.entity_id, false);
  if (authDeletion.error) {
    const released = await db.rpc("admin_release_trash_user_purge", {
      actor_profile_id: actor.id,
      requested_entry_id: entry.id,
      requested_purge_token: purgeToken,
    });
    if (released.error) {
      console.error("Trash Bin user claim release failed", {
        entryId: entry.id,
        code: released.error.code,
      });
    }
    throw new Error(
      `${entry.display_name}: the account has protected references and could not be permanently deleted.`,
    );
  }

  await finalizeClaimedUser(entry, actor, purgeToken);
}

async function deleteDatabaseEntry(entry: TrashEntrySnapshot, actor: TrashActor) {
  const db = createSupabaseAdminClient();
  const purged = await db.rpc("admin_purge_trash_database_entry", {
    actor_profile_id: actor.id,
    requested_entry_id: entry.id,
  });
  if (purged.error) {
    throw new Error(safeDatabaseMessage(entry.display_name, purged.error));
  }
}

async function deleteProduct(entry: TrashEntrySnapshot, actor: TrashActor) {
  const db = createSupabaseAdminClient();
  const prepared = await db.rpc("admin_prepare_trash_product_purge", {
    actor_profile_id: actor.id,
    requested_entry_id: entry.id,
  });
  if (prepared.error || !prepared.data) {
    throw new Error(safeDatabaseMessage(entry.display_name, prepared.error));
  }

  const result = prepared.data as {
    purge_token?: unknown;
    storage_paths?: unknown;
  };
  const purgeToken = String(result.purge_token ?? "");
  if (!purgeToken) {
    throw new Error(
      `${entry.display_name}: the product deletion claim is invalid.`,
    );
  }
  const storagePaths = Array.isArray(result.storage_paths)
    ? result.storage_paths.filter(
        (path): path is string => typeof path === "string" && path.length > 0,
      )
    : [];
  if (storagePaths.length > 0) {
    const storage = await db.storage.from("product-media").remove(storagePaths);
    if (storage.error) {
      throw new Error(
        `${entry.display_name}: product images could not be removed. The cleanup remains in the Trash Bin for retry.`,
      );
    }
  }

  const finalized = await db.rpc("admin_finalize_trash_product_purge", {
    actor_profile_id: actor.id,
    requested_entry_id: entry.id,
    requested_purge_token: purgeToken,
  });
  if (finalized.error) {
    throw new Error(
      `${entry.display_name}: product files were removed, but Trash Bin finalization requires attention.`,
    );
  }
}

export async function permanentlyDeleteTrashEntry(
  entry: TrashEntrySnapshot,
  actor: TrashActor,
) {
  if (entry.entity_type === "user") {
    await deleteUser(entry, actor);
    return;
  }
  if (entry.entity_type === "product") {
    await deleteProduct(entry, actor);
    return;
  }
  await deleteDatabaseEntry(entry, actor);
}
