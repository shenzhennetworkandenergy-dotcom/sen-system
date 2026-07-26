"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function openNotificationAction(
  notificationId: string,
  href: string,
) {
  const { profile } = await requireProfile(["customer", "admin"]);
  const safeHref = href.startsWith("/account/") ? href : "/account/notifications";
  await createSupabaseAdminClient()
    .from("customer_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("profile_id", profile.id);
  revalidatePath("/account");
  revalidatePath("/account/notifications");
  redirect(safeHref);
}

export async function markAllNotificationsReadAction() {
  const { profile } = await requireProfile(["customer", "admin"]);
  await createSupabaseAdminClient()
    .from("customer_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("read_at", null);
  revalidatePath("/account");
  revalidatePath("/account/notifications");
  redirect("/account/notifications");
}

