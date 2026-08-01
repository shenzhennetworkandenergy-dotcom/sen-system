import Link from "next/link";
import { connection } from "next/server";

import { updateDeletionModeAction } from "./actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { PermanentDeletionToggle } from "@/components/settings/PermanentDeletionToggle";
import { requireProfile } from "@/lib/auth/session";
import { routes } from "@/lib/constants/routes";
import { getDeletionMode } from "@/lib/deletion/settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function DataManagementSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  await requireProfile(["admin"]);
  const [notice, mode] = await Promise.all([searchParams, getDeletionMode()]);
  const { data: updater } = mode.updatedBy
    ? await createSupabaseAdminClient()
        .from("profiles")
        .select("full_name,email")
        .eq("id", mode.updatedBy)
        .maybeSingle()
    : { data: null };

  return (
    <DashboardShell
      admin
      title="Data management"
      subtitle="Control deletion behavior and recover records removed from normal views."
    >
      {notice.success ? (
        <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-emerald-950">
          {notice.success}
        </p>
      ) : null}
      {notice.error ? (
        <p className="mb-5 rounded-xl bg-red-50 p-4 text-red-950">
          {notice.error}
        </p>
      ) : null}

      <section
        className={`rounded-2xl border-2 p-6 ${
          mode.permanentEnabled
            ? "border-red-400 bg-red-50 text-red-950"
            : "border-emerald-300 bg-emerald-50 text-emerald-950"
        }`}
      >
        <p className="text-xs font-bold uppercase tracking-wider">
          Current deletion policy
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          {mode.permanentEnabled
            ? "Permanent deletion is ON"
            : "Recoverable deletion is ON"}
        </h2>
        <p className="mt-2 max-w-3xl">
          {mode.permanentEnabled
            ? "Administrators can permanently remove eligible development records. The action cannot be undone."
            : "Delete actions move supported records out of dashboards and into the recoverable Trash Bin."}
        </p>
        {mode.updatedAt ? (
          <p className="mt-3 text-sm">
            Last changed {new Date(mode.updatedAt).toLocaleString()} by{" "}
            {updater?.full_name ?? updater?.email ?? "an administrator"}.
          </p>
        ) : null}
        <PermanentDeletionToggle
          enabled={mode.permanentEnabled}
          action={updateDeletionModeAction}
        />
      </section>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Link
          href={routes.adminTrashBin}
          className="rounded-2xl border bg-[var(--surface)] p-5"
        >
          <h2 className="text-xl font-bold">Trash Bin</h2>
          <p className="mt-2 text-sm text-[var(--muted-text)]">
            Restore deleted records or permanently remove eligible items when
            Permanent Deletion Mode is enabled.
          </p>
        </Link>
        <Link
          href={routes.adminPaymentSettings}
          className="rounded-2xl border bg-[var(--surface)] p-5"
        >
          <h2 className="text-xl font-bold">Payment gateways</h2>
          <p className="mt-2 text-sm text-[var(--muted-text)]">
            Configure available payment adapters and test mode.
          </p>
        </Link>
      </div>
    </DashboardShell>
  );
}
