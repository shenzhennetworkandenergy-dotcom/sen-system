export const employeePermissionModuleKeys = [
  "employees.view",
  "employees.view_detail",
  "employees.edit_profile",
  "employees.view_permissions",
  "employees.manage_permissions",
  "employees.view_activity",
] as const;

export type EmployeePermissionModuleKey = (typeof employeePermissionModuleKeys)[number];

export type EmployeeDirectoryAccess = {
  canOpen: boolean;
  canViewContactSummary: boolean;
  canViewDetails: boolean;
  canEditProfile: boolean;
  canViewPermissions: boolean;
  canManagePermissions: boolean;
  canViewActivity: boolean;
};

export type EmployeeDetailAccess = Omit<EmployeeDirectoryAccess, "canViewContactSummary">;

export function resolveEmployeeDirectoryAccess(permissions: ReadonlySet<string>): EmployeeDirectoryAccess {
  const access = {
    canViewContactSummary: permissions.has("employees.view"),
    canViewDetails: permissions.has("employees.view_detail"),
    canEditProfile: permissions.has("employees.edit_profile"),
    canViewPermissions: permissions.has("employees.view_permissions"),
    canManagePermissions: permissions.has("employees.manage_permissions"),
    canViewActivity: permissions.has("employees.view_activity"),
  };
  return { canOpen: Object.values(access).some(Boolean), ...access };
}

export function resolveEmployeeDetailAccess(permissions: ReadonlySet<string>): EmployeeDetailAccess {
  const directory = resolveEmployeeDirectoryAccess(permissions);
  return {
    canOpen: directory.canOpen,
    canViewDetails: directory.canViewDetails,
    canEditProfile: directory.canEditProfile,
    canViewPermissions: directory.canViewPermissions,
    canManagePermissions: directory.canManagePermissions,
    canViewActivity: directory.canViewActivity,
  };
}
