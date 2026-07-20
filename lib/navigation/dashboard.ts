import { routes } from "@/lib/constants/routes";

export type DashboardNavigationItem = {
  key: string;
  label: string;
  route: string | null;
  group: "administration" | "workspace" | "planned";
  iconKey: string;
  requiredPermission: string | null;
  implemented: boolean;
};

export const adminNavigation: DashboardNavigationItem[] = [
  { key: "admin-overview", label: "Overview", route: routes.admin, group: "administration", iconKey: "dashboard", requiredPermission: null, implemented: true },
  { key: "admin-users", label: "Users", route: routes.adminUsers, group: "administration", iconKey: "users", requiredPermission: "users.view", implemented: true },
  { key: "admin-permissions", label: "Permissions", route: routes.adminPermissions, group: "administration", iconKey: "permissions", requiredPermission: "users.manage_permissions", implemented: true },
  { key: "admin-activity", label: "Team Activity", route: routes.adminActivity, group: "administration", iconKey: "activity", requiredPermission: "activity.view_all", implemented: true },
];

export const employeeNavigation: DashboardNavigationItem[] = [
  { key: "employee-dashboard", label: "Employee Dashboard", route: routes.employee, group: "workspace", iconKey: "dashboard", requiredPermission: "dashboard.view", implemented: true },
  { key: "employee-activity", label: "My Activity", route: routes.employeeActivity, group: "workspace", iconKey: "activity", requiredPermission: "activity.view_own", implemented: true },
];

export function visibleEmployeeNavigation(permissionKeys: Iterable<string>) {
  const permissions = new Set(permissionKeys);
  return employeeNavigation.filter((item) => item.implemented && (!item.requiredPermission || permissions.has(item.requiredPermission)));
}
