import "server-only";
import { randomInt } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EpsClient, EpsError, bdtAmount, epsCheckoutUrl } from "./eps";
import {
  epsConfigured,
  getEpsCredentials,
  getPaymentOrigin,
} from "./eps-config";

export type EpsAttempt = {
  id: string;
  order_id: string;
  profile_id: string;
  transaction_id: string;
  merchant_transaction_id: string;
  test_mode: boolean;
  amount: string | number;
  status: string;
  checkout_url: string | null;
  eps_transaction_id: string | null;
  financial_entity: string | null;
  created_at: string;
  verified_at: string | null;
  verification_error: string | null;
  last_checked_at: string | null;
};
const validId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function resumableEpsUrl(attempt: EpsAttempt | undefined) {
  if (!attempt?.checkout_url || !["ready", "pending"].includes(attempt.status)) return null;
  try {
    return epsCheckoutUrl(attempt.checkout_url, attempt.test_mode ? "sandbox" : "live");
  } catch {
    return null;
  }
}

export async function restoreUnpaidEpsCart(orderId: string, profileId: string) {
  if (!validId(orderId)) return "unavailable";
  const { data, error } = await createSupabaseAdminClient().rpc("restore_unpaid_eps_cart", {
    requested_order_id: orderId,
    requested_profile_id: profileId,
    requested_admin_id: process.env.EPS_RECEIVING_ADMIN_ID || null,
  });
  return error ? "unavailable" : data;
}

export async function getRecoverableEpsCheckouts(profileId: string) {
  const { data } = await createSupabaseAdminClient()
    .from("eps_checkout_requests")
    .select("order_id,sales_orders!inner(order_number,status,total_amount,currency)")
    .eq("profile_id", profileId)
    .is("cart_restored_at", null)
    .eq("sales_orders.paid_amount", 0)
    .in("sales_orders.status", ["confirmed", "cancelled"])
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []) as unknown as {
    order_id: string;
    sales_orders: { order_number: string; status: string; total_amount: number; currency: string };
  }[];
}

export async function availableEpsGateway() {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .from("payment_gateways")
      .select("id,test_mode")
      .eq("code", "eps")
      .eq("adapter", "eps")
      .eq("enabled", true)
      .maybeSingle();
    return !error && data && epsConfigured(data.test_mode) ? data : null;
  } catch {
    return null;
  }
}

export async function getOrderEpsAttempts(
  orderId: string,
  customerId?: string,
) {
  const db = createSupabaseAdminClient();
  let query = db
    .from("eps_payment_attempts")
    .select(
      "id,order_id,profile_id,transaction_id,merchant_transaction_id,test_mode,amount,status,checkout_url,eps_transaction_id,financial_entity,created_at,verified_at,verification_error,last_checked_at",
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (customerId) query = query.eq("profile_id", customerId);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []) as EpsAttempt[];
}

export async function startEpsPayment(orderId: string, customerId: string) {
  if (!validId(orderId) || !validId(customerId)) throw new EpsError("rejected");
  const db = createSupabaseAdminClient();
  const gateway = await availableEpsGateway();
  if (!gateway) throw new EpsError("configuration");
  if (!gateway.test_mode) {
    const { data: receiver } = await db
      .from("profiles")
      .select("id")
      .eq(
        "id",
        process.env.EPS_RECEIVING_ADMIN_ID ??
          "00000000-0000-0000-0000-000000000000",
      )
      .eq("role", "admin")
      .eq("status", "active")
      .is("archived_at", null)
      .maybeSingle();
    if (!receiver) throw new EpsError("configuration");
  }
  const origin = getPaymentOrigin();
  const { data: result, error } = await db.rpc("begin_eps_payment", {
    requested_order_id: orderId,
    actor_profile_id: customerId,
    requested_merchant_id: `${Date.now()}${randomInt(1_000_000_000_000).toString().padStart(12, "0")}`,
  });
  if (error || !result?.attempt) throw new EpsError("rejected");
  const attempt = result.attempt as EpsAttempt;
  if (!result.created) {
    if (["ready", "pending"].includes(attempt.status) && attempt.checkout_url)
      return epsCheckoutUrl(
        attempt.checkout_url,
        attempt.test_mode ? "sandbox" : "live",
      );
    throw new EpsError("unavailable", true);
  }
  try {
    const [{ data: order }, { data: products }, { data: profile }] =
      await Promise.all([
        db
          .from("sales_orders")
          .select(
            "order_number,shipping_address_snapshot,billing_address_snapshot",
          )
          .eq("id", orderId)
          .eq("customer_profile_id", customerId)
          .single(),
        db
          .from("sales_order_items")
          .select("product_name_snapshot,quantity,unit_price")
          .eq("order_id", orderId),
        db
          .from("profiles")
          .select("full_name,email,phone")
          .eq("id", customerId)
          .single(),
      ]);
    if (!order || !products?.length || !profile) throw new EpsError("rejected");
    const address = order.shipping_address_snapshot as Record<string, string>;
    const billing = order.billing_address_snapshot as Record<string, string>;
    if (!address.postal_code?.trim() || !address.city?.trim())
      throw new EpsError("rejected");
    const callback = `${origin}/api/payments/eps/return/${attempt.id}`;
    const checkout = await new EpsClient(
      getEpsCredentials(attempt.test_mode),
    ).initialize({
      merchantTransactionId: attempt.merchant_transaction_id,
      customerOrderId: attempt.merchant_transaction_id,
      amount: bdtAmount(attempt.amount),
      successUrl: `${callback}?outcome=success`,
      failUrl: `${callback}?outcome=failed`,
      cancelUrl: `${callback}?outcome=cancelled`,
      customer: {
        name: profile.full_name || address.recipient_name,
        email: billing.email || profile.email || "",
        phone: billing.contact_phone || address.phone || profile.phone || "",
        address: address.address_line_1,
        address2: address.address_line_2 || "",
        city: address.city,
        state: address.region || address.city,
        postcode: address.postal_code,
        country: address.country_code,
      },
      products: products.map((p) => ({
        name: p.product_name_snapshot,
        quantity: String(p.quantity),
        price: Number(p.unit_price).toFixed(2),
      })),
    });
    const saved = await db
      .from("eps_payment_attempts")
      .update({
        status: "ready",
        initialization_id: checkout.initializationId,
        checkout_url: checkout.checkoutUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .eq("status", "initializing")
      .select("id");
    if (saved.error || !saved.data?.length)
      throw new EpsError("unavailable", true);
    return checkout.checkoutUrl;
  } catch (error) {
    const known = error instanceof EpsError;
    const uncertain = !known || error.uncertain;
    await db
      .from("eps_payment_attempts")
      .update({
        status: uncertain ? "unknown" : "failed",
        verification_error: known ? error.code : "unavailable",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .eq("status", "initializing");
    throw known ? error : new EpsError("unavailable", true);
  }
}

export async function reconcileEpsAttempt(attemptId: string) {
  if (!validId(attemptId)) return null;
  const db = createSupabaseAdminClient();
  const { data: attempt } = await db
    .from("eps_payment_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt) return null;
  if (["paid", "sandbox_paid"].includes(attempt.status))
    return attempt as EpsAttempt;
  const { data: claimed, error: claimError } = await db.rpc(
    "claim_eps_verification",
    { requested_attempt_id: attempt.id },
  );
  if (claimError || !claimed) return attempt as EpsAttempt;
  try {
    const verified = await new EpsClient(
      getEpsCredentials(attempt.test_mode),
    ).verify(attempt.merchant_transaction_id, bdtAmount(attempt.amount));
    const { error } = await db.rpc("apply_eps_verification", {
      requested_attempt_id: attempt.id,
      requested_merchant_id: verified.merchantTransactionId,
      requested_amount: verified.amount,
      requested_status: verified.status,
      requested_eps_id: verified.epsTransactionId,
      requested_entity: verified.financialEntity,
      requested_receiver_id: process.env.EPS_RECEIVING_ADMIN_ID || null,
    });
    if (error) throw new EpsError("unavailable");
  } catch (error) {
    // Never save provider bodies, credentials, customer information or tokens.
    await db
      .from("eps_payment_attempts")
      .update({
        verification_error:
          error instanceof EpsError ? error.code : "unavailable",
        verification_lease_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .not("status", "in", "(paid,sandbox_paid)");
  }
  const { data: current } = await db
    .from("eps_payment_attempts")
    .select("*")
    .eq("id", attempt.id)
    .maybeSingle();
  return (current ?? attempt) as EpsAttempt;
}
