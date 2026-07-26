"use server";

import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth/session";
import { createGatewayCheckout } from "@/lib/payments/gateways";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
