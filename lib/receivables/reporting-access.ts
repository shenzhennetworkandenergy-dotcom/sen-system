import "server-only";

import { getEffectivePermissions } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import {
  normalizeReportingScope,
  type ReceivablesReportScope,
  type ReportingProfile,
} from "@/lib/receivables/reporting";

/**
 * Resolve reporting access from the authenticated session only.  Callers must
 * not pass an actor/profile id supplied by a request; service-role reads are
 * made only after this resolver has established the scope.
 */
export async function getReceivablesReportScope(): Promise<ReceivablesReportScope> {
  const { user, profile } = await getCurrentProfile();
  if (!user || !profile) {
    return normalizeReportingScope({ profile: null, permissions: new Set() });
  }
  if (profile.status !== "active" || profile.archived_at != null) {
    return normalizeReportingScope({ profile, permissions: new Set() });
  }
  const permissions = await getEffectivePermissions(profile.id);
  return normalizeReportingScope({ profile, permissions });
}

/** Pure alias for route/tests that already hold the authenticated profile. */
export function resolveReceivablesReportScope(input: {
  profile: ReportingProfile | null | undefined;
  permissions: ReadonlySet<string> | Iterable<string>;
}) {
  return normalizeReportingScope(input);
}
