"use server";

import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { createGatewayCheckout } from "@/lib/payments/gateways";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOrderEpsAttempts, manageUnpaidEpsCheckout, reconcileEpsAttempt, startEpsPayment } from "@/lib/payments/eps-server";
import { revalidatePath } from "next/cache";

export async function beginPaymentAction(orderId: string, form: FormData) {
  const { profile } = await requireProfile(["customer", "admin"]);
  const db = createSupabaseAdminClient();
  const gatewayId = String(form.get("gateway_id") ?? "");
  const [{ data: order }, { data: gateway }] = await Promise.all([
    db
      .from("sales_orders")
      .select(
        "id,order_number,total_amount,paid_amount,currency,status,customer_profile_id",
      )
      .eq("id", orderId)
      .eq("customer_profile_id", profile.id)
      .maybeSingle(),
    db
      .from("payment_gateways")
      .select("*")
      .eq("id", gatewayId)
      .eq("enabled", true)
      .maybeSingle(),
  ]);

  if (!order || !gateway) {
    redirect(
      `/account/orders/${orderId}/pay?error=Order%20or%20gateway%20not%20available.`,
    );
  }

  const amount = Math.max(
    0,
    Number(order.total_amount) - Number(order.paid_amount ?? 0),
  );
  if (amount <= 0) {
    redirect(`/account/orders/${orderId}?success=Order%20is%20already%20paid.`);
  }

  if (gateway.adapter === "eps") {
    let checkoutUrl: string;
    try { checkoutUrl = await startEpsPayment(orderId, profile.id); }
    catch { redirect(`/account/orders/${orderId}/pay?error=Payment%20is%20not%20confirmed.%20Check%20payment%20status%20before%20trying%20again.`); }
    redirect(checkoutUrl);
  }

  const { data: onlineOrder, error: onlineOrderError } = await db
    .from("eps_checkout_requests")
    .select("order_id")
    .eq("order_id", orderId)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (onlineOrder || onlineOrderError) {
    redirect(`/account/orders/${orderId}/pay?error=Use%20the%20existing%20EPS%20payment%20for%20this%20online%20order.`);
  }

  const origin = String(form.get("origin") ?? "").replace(/\/$/, "");
  if (gateway.adapter === "manual") {
    const { error } = await db.from("payment_transactions").insert({
      order_id: order.id,
      profile_id: profile.id,
      gateway_id: gateway.id,
      status: "pending",
      amount,
      currency: order.currency,
      safe_response: { method: "cash_on_delivery" },
    });
    if (error) {
      redirect(
        `/account/orders/${orderId}/pay?error=Unable%20to%20save%20payment%20selection.`,
      );
    }
    redirect(
      `/account/orders/${orderId}?success=Cash%20on%20delivery%20selected.`,
    );
  }

  let checkout;
  try {
    checkout = await createGatewayCheckout(gateway, {
      orderId: order.id,
      orderNumber: order.order_number,
      amount,
      currency: order.currency,
      customerName: profile.full_name ?? "Customer",
      customerEmail: profile.email ?? "",
      customerPhone: profile.phone,
      returnUrl: `${origin}/account/orders/${orderId}/pay/return`,
      cancelUrl: `${origin}/account/orders/${orderId}/pay?error=Payment%20cancelled.`,
    });
  } catch (error) {
    console.error("Payment checkout failed", {
      gateway: gateway.code,
      message: error instanceof Error ? error.message : "Unknown",
    });
    redirect(
      `/account/orders/${orderId}/pay?error=${encodeURIComponent(
        error instanceof Error
          ? error.message
          : "Unable to start payment.",
      )}`,
    );
  }

  if (!checkout) {
    redirect(
      `/account/orders/${orderId}/pay?error=Checkout%20is%20unavailable.`,
    );
  }

  const { error } = await db.from("payment_transactions").insert({
    order_id: order.id,
    profile_id: profile.id,
    gateway_id: gateway.id,
    gateway_transaction_id: checkout.transactionId,
    status: "processing",
    amount,
    currency: order.currency,
    checkout_url: checkout.checkoutUrl,
  });
  if (error) {
    redirect(
      `/account/orders/${orderId}/pay?error=Unable%20to%20save%20the%20payment%20attempt.`,
    );
  }
  redirect(checkout.checkoutUrl);
}

export async function checkEpsPaymentAction(orderId: string) {
  const { profile } = await requireProfile(["customer", "admin"]);
  const attempts = await getOrderEpsAttempts(orderId, profile.id);
  const checked = [];
  for (const attempt of attempts.slice(0, 3)) {
    const current = await reconcileEpsAttempt(attempt.id);
    if (current && current.last_checked_at !== attempt.last_checked_at) checked.push(current);
  }
  const result = await manageUnpaidEpsCheckout(orderId, profile.id, null);
  revalidatePath("/cart");
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath(`/account/orders/${orderId}/pay`);
  returnToCartAfterCheckoutChange(result);
  const check = checked.some(attempt => attempt.verification_error) ? "unavailable"
    : checked.some(attempt => attempt.status === "pending") ? "pending"
    : checked.length ? "updated" : "recent";
  redirect(`/account/orders/${orderId}/pay?check=${check}`);
}

function returnToCartAfterCheckoutChange(result: unknown) {
  if (result === "restored") redirect("/cart?success=Your%20items%20were%20returned%20to%20your%20cart.");
  if (result === "removed") redirect("/cart?success=Pending%20checkout%20deleted.%20Any%20reserved%20stock%20was%20released.");
}

export async function manageEpsCheckoutAction(orderId: string, form: FormData) {
  const { profile } = await requireProfile(["customer", "admin"]);
  const mode = form.get("mode");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(orderId) ||
      (mode !== "edit" && mode !== "remove")) {
    redirect("/cart?error=Saved%20checkout%20unavailable.");
  }
  // Save the customer's choice before calling EPS. A delayed verification can finish it later.
  let result = await manageUnpaidEpsCheckout(orderId, profile.id, mode);
  if (result === "queued") {
    const attempts = await getOrderEpsAttempts(orderId, profile.id);
    for (const attempt of attempts) {
      if (["initializing", "ready", "unknown", "pending"].includes(attempt.status)) {
        await reconcileEpsAttempt(attempt.id);
      }
    }
    result = await manageUnpaidEpsCheckout(orderId, profile.id, null);
  }
  revalidatePath("/cart");
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath(`/account/orders/${orderId}/pay`);
  returnToCartAfterCheckoutChange(result);
  if (result === "queued") {
    const { data: checkout } = await createSupabaseAdminClient()
      .from("eps_checkout_requests")
      .select("requested_change")
      .eq("order_id", orderId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (checkout?.requested_change === "remove") redirect("/cart?checkout=removed-pending-review");
    redirect(`/account/orders/${orderId}/pay`);
  }
  const message = result === "blocked"
    ? "This checkout can no longer be changed. Check the payment or order status below."
    : "Unable to update this checkout. Contact SEN with your order number.";
  redirect(`/account/orders/${orderId}/pay?error=${encodeURIComponent(message)}`);
}
