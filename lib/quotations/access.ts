import "server-only";

import { requireAnyPermission } from "@/lib/auth/permissions";
import {
  QUOTATION_VIEW_PERMISSIONS,
  resolveQuotationViewScope,
} from "@/lib/quotations/access-policy";

export async function requireQuotationView() {
  const context = await requireAnyPermission([...QUOTATION_VIEW_PERMISSIONS]);
  const scope = resolveQuotationViewScope(
    context.profile.role,
    context.permissions,
  );

  return { ...context, quotationViewScope: scope! };
}
