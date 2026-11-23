"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { reconcileEpsAttempt } from "@/lib/payments/eps-server";
export async function verifyEpsPaymentAction(form: FormData) {
  await requireProfile(["admin"]);
  await reconcileEpsAttempt(String(form.get("attempt_id") ?? ""));
  revalidatePath("/admin/settings/payments/eps");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/orders");
  redirect("/admin/settings/payments/eps");
}
