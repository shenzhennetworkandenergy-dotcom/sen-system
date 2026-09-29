import "server-only";

import { redirect } from "next/navigation";

import { getEffectivePermissions } from "@/lib/auth/permissions";
import { routes } from "@/lib/constants/routes";
import {
  canAccessEmployeeRecruitment,
  RECRUITMENT_ACCESS_PERMISSION,
} from "@/lib/hr/recruitment-access-policy";
import { requireEmployeeHrRecord } from "@/lib/hr/self-service";

export async function requireEmployeeRecruitmentAccess() {
  const context = await requireEmployeeHrRecord();
  const permissions = await getEffectivePermissions(context.profile.id);
  if (!canAccessEmployeeRecruitment(
    context.profile.role,
    context.profile.status,
    permissions,
  )) {
    redirect(routes.employeeHr);
  }
  return { ...context, permissions };
}

export { RECRUITMENT_ACCESS_PERMISSION };
