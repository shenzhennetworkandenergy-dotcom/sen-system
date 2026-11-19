import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireProfile as requireErpProfile, type Profile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ACCOUNTS_ENTRY, ACCOUNTS_REQUEST_PATH, accountsReturnPath, accountsHost } from "./accounts-routing";
import { readPropertiesAccess } from "./properties-access";

export async function isAccountsRequest() { return accountsHost(await headers()) !== null; }

export type MurshidaAccess = {
  viewer: { name: string; canManage: boolean; isSuperAdmin: boolean };
  profile: Profile | null;
};

// React cache deduplicates within the render; authorization is checked again on every request.
export const requireMurshidaAccess = cache(async (): Promise<MurshidaAccess> => {
  const incoming = await headers();
  const host = accountsHost(incoming);
  if (!host) {
    const { profile } = await requireErpProfile(["admin"]);
    return { viewer: { name: profile.full_name ?? "Administrator", canManage: true, isSuperAdmin: true }, profile };
  }
  const access = await readPropertiesAccess(incoming.get("cookie") ?? "", host,
    process.env.MURSHIDA_ACCOUNTS_BRIDGE_KEY ?? "", process.env.MURSHIDA_ACCOUNTS_AUTHORITY_URL);
  if (access.kind !== "authorized") {
    const next = accountsReturnPath(incoming.get(ACCOUNTS_REQUEST_PATH));
    redirect(`${ACCOUNTS_ENTRY}/?next=${encodeURIComponent(next)}${access.kind === "unavailable" ? "&state=unavailable" : ""}`);
  }
  let profile: Profile | null = null;
  if (access.viewer.can_manage) {
    const result = await createSupabaseAdminClient().from("profiles").select("*")
      .eq("email", access.viewer.email).eq("role", "admin").eq("status", "active").is("archived_at", null).maybeSingle();
    if (result.error) throw new Error("Unable to verify the property administrator.");
    profile = result.data as Profile | null;
  }
  return { viewer: { name: access.viewer.name, isSuperAdmin: access.viewer.can_manage,
    canManage: access.viewer.can_manage && profile !== null }, profile };
});

export async function requireMurshidaManager() {
  const access = await requireMurshidaAccess();
  if (!access.viewer.canManage || !access.profile) redirect(`${ACCOUNTS_ENTRY}/?state=readonly`);
  return { ...access, profile: access.profile };
}
