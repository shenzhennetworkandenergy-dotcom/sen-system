import { ActivityTable, type ActivityRow } from "@/components/activity/ActivityTable";
import { DashboardShell } from "@/components/dashboard/Shell";
import { getPermissionCatalogue, getPermissionMatrix } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { routes } from "@/lib/constants/routes";
import { getAuthorizedPhysicalReturnQueue } from "@/lib/inventory/rma-return-data";
import { employeeModuleRouteMap } from "@/lib/navigation/dashboard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function EmployeePage() {
  const { profile } = await requireProfile(["employee"]);
  const [matrix, modules, physicalReturnClaims] = await Promise.all([
    getPermissionMatrix(profile.id),
    getPermissionCatalogue(),
    getAuthorizedPhysicalReturnQueue(profile.id),
  ]);
  const permittedModules = modules.filter((module) =>
    module.permissions.some((permission) => matrix.effectiveKeys.includes(permission.key)),
  );
  const visibleRoutes = employeeModuleRouteMap(matrix.effectiveKeys);
  const canViewActivity = matrix.effectiveKeys.includes("activity.view_own");
  const { data: activity } = canViewActivity
    ? await createSupabaseAdminClient()
        .from("audit_logs")
        .select("id,actor_id,action,module,entity_type,entity_id,description,old_values,new_values,created_at")
        .eq("actor_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  return (
    <DashboardShell
      employeePermissions={matrix.effectiveKeys}
      title="Employee Workspace"
      subtitle={`Welcome ${profile.full_name ?? profile.email ?? "employee"}. Only the areas assigned by an administrator are shown.`}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border bg-[var(--surface)] p-6">
          <p className="text-sm text-[var(--muted-text)]">Role and status</p>
          <p className="mt-2 font-semibold">{profile.role} · {profile.status}</p>
        </article>
        <article className="rounded-xl border bg-[var(--surface)] p-6">
          <p className="text-sm text-[var(--muted-text)]">Permission template</p>
          <p className="mt-2 font-semibold">{matrix.template?.name ?? "No active template"}</p>
        </article>
        <article className="rounded-xl border bg-[var(--surface)] p-6">
          <p className="text-sm text-[var(--muted-text)]">Effective permissions</p>
          <p className="mt-2 text-3xl font-bold">{matrix.effectiveKeys.length}</p>
        </article>
      </section>

      <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="text-xl font-semibold text-blue-950">My HR workspace</h2>
        <p className="mt-2 text-blue-900">Review attendance and leave, submit correction requests, and follow administrator decisions.</p>
        <a href={routes.employeeHr} className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Open My HR</a>
      </section>

      {physicalReturnClaims.length ? (
        <section className="mt-6 rounded-xl border bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">Physical customer returns</h2>
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            Confirm only products that have physically arrived at one of your authorized warehouses.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {physicalReturnClaims.map((claim) => (
              <a
                key={claim.id}
                href={`/employee/rma/${claim.id}/receive`}
                className="rounded-lg border p-4 transition hover:border-blue-400 hover:bg-blue-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <strong>{claim.rmaNumber}</strong>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                    {claim.quantityRemaining} to receive
                  </span>
                </div>
                <p className="mt-2 text-sm">{claim.orderNumber}</p>
                <p className="text-sm text-[var(--muted-text)]">{claim.warehouseName}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold">Permitted modules</h2>
        {permittedModules.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {permittedModules.map((module) => {
              const route = visibleRoutes.get(module.key);
              const content = (
                <>
                  <h3 className="font-semibold">{module.name}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-text)]">
                    {module.is_implemented && route
                      ? "Open permitted workspace"
                      : "Permission reserved for a future module"}
                  </p>
                </>
              );
              return route ? (
                <a
                  key={module.id}
                  href={route}
                  className="rounded border p-4 transition hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50 hover:shadow-md"
                >
                  {content}
                </a>
              ) : (
                <article key={module.id} className="rounded border p-4 opacity-70">
                  {content}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-[var(--muted-text)]">No employee modules are currently permitted.</p>
        )}
      </section>

      {canViewActivity ? (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent activity</h2>
            <a href={routes.employeeActivity} className="font-semibold">View all</a>
          </div>
          <ActivityTable
            rows={(activity ?? []) as ActivityRow[]}
            people={{ [profile.id]: { name: profile.full_name ?? profile.email ?? "You", email: profile.email } }}
          />
        </section>
      ) : null}
    </DashboardShell>
  );
}
