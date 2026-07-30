import Link from "next/link";
import { connection } from "next/server";

import { restoreArchivedRecordAction } from "./actions";
import {
  deleteAttributeAction,
  deleteBrandAction,
} from "@/app/admin/catalog-actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { requireProfile } from "@/lib/auth/session";
import { routes } from "@/lib/constants/routes";
import { archiveEntityTypes } from "@/lib/deletion/policy";
import { getDeletionMode } from "@/lib/deletion/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    success?: string;
    error?: string;
  }>;
}) {
  await connection();
  await requireProfile(["admin"]);
  const params = await searchParams;
  const mode = await getDeletionMode();
  const db = createSupabaseAdminClient();
  let query = db
    .from("archive_entries")
    .select(
      "id,entity_type,entity_id,display_name,reason,metadata,archived_by,archived_at",
    )
    .order("archived_at", { ascending: false })
    .limit(200);
  if (archiveEntityTypes.includes(params.type as never))
    query = query.eq("entity_type", params.type);
  if (params.q?.trim())
    query = query.ilike("display_name", `%${params.q.trim().slice(0, 80)}%`);
  const { data: entries, error } = await query;
  const actorIds = [
    ...new Set((entries ?? []).map((entry) => entry.archived_by).filter(Boolean)),
  ];
  const { data: actors } = actorIds.length
    ? await db.from("profiles").select("id,full_name,email").in("id", actorIds)
    : { data: [] };
  const actorMap = new Map(
    (actors ?? []).map((actor) => [
      actor.id,
      actor.full_name ?? actor.email ?? "Administrator",
    ]),
  );

  return (
    <DashboardShell
      admin
      title="Archive"
      subtitle="Records stored outside normal dashboards can be reviewed and restored here."
    >
      {params.success ? (
        <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-emerald-950">
          {params.success}
        </p>
      ) : null}
      {params.error || error ? (
        <p className="mb-5 rounded-xl bg-red-50 p-4 text-red-950">
          {params.error ?? "Unable to load the Archive."}
        </p>
      ) : null}

      <div
        className={`mb-5 rounded-xl border p-4 ${
          mode.permanentEnabled
            ? "border-red-300 bg-red-50 text-red-950"
            : "border-emerald-300 bg-emerald-50 text-emerald-950"
        }`}
      >
        <strong>
          {mode.permanentEnabled
            ? "Permanent Deletion Mode is enabled."
            : "Archive protection is enabled."}
        </strong>{" "}
        {mode.permanentEnabled
          ? "Open an archived record to permanently remove it."
          : "Archived records remain recoverable."}
        <Link
          href={routes.adminDataManagement}
          className="ml-2 font-bold underline"
        >
          Change setting
        </Link>
      </div>

      <form className="mb-5 grid gap-3 rounded-xl border bg-[var(--surface)] p-4 sm:grid-cols-[1fr_220px_auto]">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search archived records"
          className="rounded-lg border p-3"
        />
        <select
          name="type"
          defaultValue={params.type}
          className="rounded-lg border p-3"
        >
          <option value="">All record types</option>
          <option value="product">Products</option>
          <option value="user">Users</option>
          <option value="brand">Brands</option>
          <option value="attribute">Attributes</option>
        </select>
        <button className="rounded-lg border px-5 py-3 font-bold">
          Apply filters
        </button>
      </form>

      {entries?.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {entries.map((entry) => {
            const detailHref =
              entry.entity_type === "product"
                ? `/admin/products/${entry.entity_id}`
                : entry.entity_type === "user"
                  ? `/admin/users/${entry.entity_id}`
                  : `/admin/${entry.entity_type}s`;
            return (
              <article
                key={entry.id}
                className="rounded-2xl border bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-text)]">
                      {entry.entity_type}
                    </p>
                    <h2 className="mt-1 text-xl font-bold">
                      {entry.display_name}
                    </h2>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                    Archived
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--muted-text)]">
                  {entry.reason ?? "No reason supplied"}
                </p>
                <p className="mt-2 text-xs text-[var(--muted-text)]">
                  {new Date(entry.archived_at).toLocaleString()} by{" "}
                  {entry.archived_by
                    ? actorMap.get(entry.archived_by) ?? "Administrator"
                    : "Administrator"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <form
                    action={restoreArchivedRecordAction.bind(
                      null,
                      entry.entity_type,
                      entry.entity_id,
                    )}
                  >
                    <ConfirmSubmitButton
                      confirmation={`Restore ${entry.display_name}?`}
                      className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white"
                    >
                      Restore
                    </ConfirmSubmitButton>
                  </form>
                  {mode.permanentEnabled &&
                  ["brand", "attribute"].includes(entry.entity_type) ? (
                    <form
                      action={
                        entry.entity_type === "brand"
                          ? deleteBrandAction.bind(null, entry.entity_id)
                          : deleteAttributeAction.bind(null, entry.entity_id)
                      }
                    >
                      <ConfirmSubmitButton
                        confirmation={`Permanently delete ${entry.display_name}? This cannot be undone.`}
                        className="rounded-lg border border-red-400 px-4 py-2 font-bold text-red-800"
                      >
                        Delete permanently
                      </ConfirmSubmitButton>
                    </form>
                  ) : (
                    <Link
                      href={detailHref}
                      className={`rounded-lg border px-4 py-2 font-bold ${
                        mode.permanentEnabled
                          ? "border-red-400 text-red-800"
                          : ""
                      }`}
                    >
                      {mode.permanentEnabled
                        ? "Open to delete permanently"
                        : "Open record"}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-2xl border bg-[var(--surface)] p-10 text-center text-[var(--muted-text)]">
          No archived records match these filters.
        </p>
      )}
    </DashboardShell>
  );
}
