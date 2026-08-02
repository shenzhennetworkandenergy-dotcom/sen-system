import { ActivityTable, type ActivityRow } from "@/components/activity/ActivityTable";
import { DashboardShell } from "@/components/dashboard/Shell";
import { getPermissionCatalogue, getPermissionMatrix } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { routes } from "@/lib/constants/routes";
import { dashboardToneForModule, visibleEmployeeNavigation } from "@/lib/navigation/dashboard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function EmployeePage() {
  const { profile } = await requireProfile(["employee"]);
  const [matrix, modules] = await Promise.all([
    getPermissionMatrix(profile.id),
    getPermissionCatalogue(),
  ]);
  const permittedModules = modules.filter((module) =>
    module.permissions.some((permission) => matrix.effectiveKeys.includes(permission.key)),
  );
  const visibleRoutes = new Map<string,string>();
  for(const item of visibleEmployeeNavigation(matrix.effectiveKeys)){
    const key=item.moduleKey??item.requiredPermission?.split(".",1)[0]??item.key;
    if(item.route&&!visibleRoutes.has(key))visibleRoutes.set(key,item.route);
  }
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

      <section data-dashboard-module-card data-dashboard-tone={dashboardToneForModule({ key: "hr" })} data-dashboard-availability="available" className="sen-dashboard-module-card mt-6 rounded-xl border p-6">
        <h2 className="text-xl font-semibold text-blue-950">My HR workspace</h2>
        <p className="mt-2 text-blue-900">Review attendance and leave, submit correction requests, and follow administrator decisions.</p>
        <a href={routes.employeeHr} className="mt-4 inline-block rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white">Open My HR</a>
      </section>

      <section className="mt-6 rounded-xl border bg-[var(--surface)] p-6">
        <h2 className="text-xl font-semibold">Permitted modules</h2>
        {permittedModules.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {permittedModules.map((module) => {
              const route = visibleRoutes.get(module.key);
              const grantedPermissions=module.permissions.filter((permission)=>matrix.effectiveKeys.includes(permission.key));
              const tone = dashboardToneForModule({ key: module.key });
              const content = (
                <>
                  <h3 className="font-semibold">{module.name}</h3>
                  <p className="mt-1 text-sm text-[var(--muted-text)]">
                    {route
                      ? "Open permitted workspace"
                      : "Permission granted; this module is not available yet"}
                  </p>
                  <ul className="mt-3 space-y-1 text-xs text-[var(--muted-text)]">{grantedPermissions.slice(0,4).map((permission)=><li key={permission.id}>✓ {permission.name}</li>)}{grantedPermissions.length>4?<li>+ {grantedPermissions.length-4} more</li>:null}</ul>
                </>
              );
              return route ? (
                <a
                  key={module.id}
                  href={route}
                  data-dashboard-module-card
                  data-dashboard-tone={tone}
                  data-dashboard-availability="available"
                  className="sen-dashboard-module-card rounded border p-4"
                >
                  {content}
                </a>
              ) : (
                <article key={module.id} data-dashboard-module-card data-dashboard-tone={tone} data-dashboard-availability="unavailable" className="sen-dashboard-module-card rounded border p-4">
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
