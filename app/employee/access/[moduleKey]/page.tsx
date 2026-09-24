import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { getPermissionCatalogue, getPermissionMatrix } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { destinationForPermission } from "@/lib/navigation/permission-destinations";

export const dynamic = "force-dynamic";

export default async function EmployeeModuleAccessPage({
  params,
}: {
  params: Promise<{ moduleKey: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["employee"]);
  const { moduleKey } = await params;
  const [matrix, modules] = await Promise.all([
    getPermissionMatrix(profile.id),
    getPermissionCatalogue(),
  ]);
  const moduleRecord = modules.find((item) => item.key === moduleKey);
  if (!moduleRecord) notFound();
  const granted = moduleRecord.permissions.filter((permission) =>
    matrix.effectiveKeys.includes(permission.key),
  );
  if (!granted.length) redirect("/employee");

  return (
    <DashboardShell
      employeePermissions={matrix.effectiveKeys}
      title={moduleRecord.name}
      subtitle="Only your administrator-approved actions are shown."
    >
      <Link
        href="/employee"
        className="mb-4 inline-block font-semibold text-[var(--primary)]"
      >
        ← Employee Dashboard
      </Link>
      <section className="rounded-xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold">Your granted permissions</h2>
        <p className="mt-2 text-sm text-[var(--muted-text)]">
          Unchecked actions and unrelated module data remain hidden.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {granted.map((permission) => {
            const destination = destinationForPermission(permission.key);
            return (
              <article key={permission.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{permission.name}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-text)]">
                      {permission.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-900">
                    Granted
                  </span>
                </div>
                {destination ? (
                  <a
                    href={destination}
                    className="mt-4 inline-block rounded-lg border px-3 py-2 text-sm font-semibold"
                  >
                    Open permitted tool
                  </a>
                ) : (
                  <p className="mt-4 text-xs text-[var(--muted-text)]">
                    This permission applies inside eligible records. The control
                    appears only when its required record and any paired
                    permission are available.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </DashboardShell>
  );
}
