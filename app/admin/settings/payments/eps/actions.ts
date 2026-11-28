"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { reconcileEpsAttempt } from "@/lib/payments/eps-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const paymentsPath = "/admin/settings/payments/eps";
export async function verifyEpsPaymentAction(form: FormData) {
  await requireProfile(["admin"]);
  await reconcileEpsAttempt(String(form.get("attempt_id") ?? ""));
  revalidatePath("/admin/settings/payments/eps");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/orders");
  redirect("/admin/settings/payments/eps");
}

export async function confirmClosedEpsCheckoutAction(orderId: string, form: FormData) {
  const { profile } = await requireProfile(["admin"]);
  const reference = String(form.get("eps_confirmation_reference") ?? "").trim();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(orderId)
    || form.get("confirmed_unpaid") !== "yes" || !/^[A-Za-z0-9][A-Za-z0-9 ._/-]{5,79}$/.test(reference)) {
    redirect(`${paymentsPath}?closure=confirmation-required#checkout-reviews`);
  }
  const { data, error } = await createSupabaseAdminClient().rpc("confirm_closed_eps_checkout", {
    requested_order_id: orderId,
    actor_profile_id: profile.id,
    eps_confirmation_reference: reference,
  });
  const outcome = !error && (data === "removed" || data === "restored" || data === "verification_busy")
    ? data : "not-eligible";
  revalidatePath(paymentsPath);
  revalidatePath("/cart");
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath(`/account/orders/${orderId}/pay`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/inventory");
  redirect(`${paymentsPath}?closure=${outcome}#checkout-reviews`);
}
