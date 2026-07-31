import Link from "next/link";
import { connection } from "next/server";

import { processTrashSelectionAction } from "./actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { requireProfile } from "@/lib/auth/session";
import { routes } from "@/lib/constants/routes";
import {
  archiveEntityTypes,
  type ArchiveEntityType,
} from "@/lib/deletion/policy";
import { getDeletionMode } from "@/lib/deletion/settings";
import { trashEntityLabels } from "@/lib/deletion/trash-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type TrashBinSearchParams = {
  q?: string;
  type?: string;
  success?: string;
  error?: string;
};

export default async function TrashBinPage({
  searchParams,
}: {
  searchParams: Promise<TrashBinSearchParams>;
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
  if (archiveEntityTypes.includes(params.type as ArchiveEntityType)) {
    query = query.eq("entity_type", params.type);
  }
  if (params.q?.trim()) {
    query = query.ilike(
      "display_name",
      `%${params.q.trim().slice(0, 80)}%`,
    );
  }

  const { data: entries, error } = await query;
  const actorIds = [
    ...new Set(
      (entries ?? [])
        .map((entry) => entry.archived_by)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const { data: actors } =
    actorIds.length > 0
      ? await db
          .from("profiles")
          .select("id,full_name,email")
          .in("id", actorIds)
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
      title="Trash Bin"
      subtitle="Restore deleted records or permanently remove eligible development data."
    >
      {params.success ? (
        <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-emerald-950">
          {params.success}
        </p>
      ) : null}
      {params.error || error ? (
        <p className="mb-5 rounded-xl bg-red-50 p-4 text-red-950">
          {params.error ?? "Unable to load the Trash Bin."}
        </p>
      ) : null}

      <section
        className={`mb-5 rounded-xl border p-4 ${
          mode.permanentEnabled
            ? "border-red-300 bg-red-50 text-red-950"
            : "border-emerald-300 bg-emerald-50 text-emerald-950"
        }`}
      >
        <strong>
          {mode.permanentEnabled
            ? "Permanent Deletion Mode is enabled."
            : "Recoverable deletion is enabled."}
        </strong>{" "}
        {mode.permanentEnabled
          ? "Eligible selected records can be deleted permanently."
          : "Selected records can be restored; permanent deletion is unavailable."}
        <Link
          href={routes.adminDataManagement}
          className="ml-2 font-bold underline"
        >
          Data Management settings
        </Link>
      </section>

      <form className="mb-5 grid gap-3 rounded-xl border bg-[var(--surface)] p-4 sm:grid-cols-[1fr_220px_auto]">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Search Trash Bin"
          className="rounded-lg border p-3"
        />
        <select
          name="type"
          defaultValue={params.type}
          className="rounded-lg border p-3"
        >
          <option value="">All record types</option>
          {archiveEntityTypes.map((entityType) => (
            <option key={entityType} value={entityType}>
              {trashEntityLabels[entityType]}
            </option>
          ))}
        </select>
        <button className="rounded-lg border px-5 py-3 font-bold">
          Apply filters
        </button>
      </form>

      {entries?.length ? (
        <form action={processTrashSelectionAction}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <ConfirmSubmitButton
              type="submit"
              name="operation"
              value="restore"
              confirmation="Restore every selected item?"
              className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white"
            >
              Restore selected
            </ConfirmSubmitButton>
            {mode.permanentEnabled ? (
              <ConfirmSubmitButton
                type="submit"
                name="operation"
                value="permanent"
                confirmation="Permanently delete every eligible selected item? This cannot be undone."
                className="rounded-lg border border-red-500 bg-red-50 px-4 py-2 font-bold text-red-800"
              >
                Delete permanently
              </ConfirmSubmitButton>
            ) : null}
            <span className="text-sm text-[var(--muted-text)]">
              Select up to 100 items. Protected records will not be permanently
              deleted.
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-[var(--surface)]">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="w-12 p-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="p-3">Item</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Deleted by</th>
                  <th className="p-3">Deleted at</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const entityType = entry.entity_type as ArchiveEntityType;
                  return (
                    <tr key={entry.id} className="border-t align-top">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          name="trash_entry_ids"
                          value={entry.id}
                          aria-label={`Select ${entry.display_name}`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="p-3">
                        <strong>{entry.display_name}</strong>
                        <p className="mt-1 break-all text-xs text-[var(--muted-text)]">
                          {entry.entity_id}
                        </p>
                      </td>
                      <td className="p-3">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
                          {trashEntityLabels[entityType] ?? entry.entity_type}
                        </span>
                      </td>
                      <td className="max-w-xs p-3 text-[var(--muted-text)]">
                        {entry.reason ?? "No reason supplied"}
                      </td>
                      <td className="p-3">
                        {entry.archived_by
                          ? actorMap.get(entry.archived_by) ?? "Administrator"
                          : "Administrator"}
                      </td>
                      <td className="whitespace-nowrap p-3">
                        {new Date(entry.archived_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      ) : (
        <p className="rounded-2xl border bg-[var(--surface)] p-10 text-center text-[var(--muted-text)]">
          No deleted records match these filters.
        </p>
      )}
    </DashboardShell>
  );
}
