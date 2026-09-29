export const RECRUITMENT_ACCESS_PERMISSION = "hr.access_recruitment";

export function canAccessEmployeeRecruitment(
  role: string | null | undefined,
  status: string | null | undefined,
  permissionKeys: Iterable<string>,
) {
  return role === "employee"
    && status === "active"
    && new Set(permissionKeys).has(RECRUITMENT_ACCESS_PERMISSION);
}
