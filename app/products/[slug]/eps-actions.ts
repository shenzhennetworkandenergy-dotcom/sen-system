"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { isValidCheckoutPhone } from "@/lib/orders/checkout-contact";
import { checkoutErrorMessage } from "@/lib/orders/checkout-errors";
import { epsProductResumePath, readEpsProductSelection } from "@/lib/orders/eps-product-checkout";
import { addressFromForm, uuid } from "@/lib/orders/validation";
import { bdtAmount } from "@/lib/payments/eps";
import { availableEpsGateway, findOpenProductEpsCheckout, startEpsPayment } from "@/lib/payments/eps-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type EpsProductCheckoutState = { error?: string };

export async function checkoutProductWithEps(
  product: { id: string; slug: string },
  _previous: EpsProductCheckoutState,
  form: FormData,
): Promise<EpsProductCheckoutState> {
  const selection = readEpsProductSelection(form.get("quantity"), form.get("variation_id"));
  if (!selection) return { error: "Choose a valid configuration and quantity." };

  const { user, profile } = await getCurrentProfile();
  if (!user) {
    const next = epsProductResumePath(product.slug, selection);
    redirect(`/login?${new URLSearchParams({ next })}`);
  }
  if (!profile || profile.status !== "active" || profile.archived_at || !["customer", "admin"].includes(profile.role)) {
    return { error: "Sign in with an active customer account to order online." };
  }
  if (!(await availableEpsGateway())) return { error: "Online payment is temporarily unavailable." };

  const email = String(form.get("billing_email") ?? "").trim().toLowerCase();
  const phone = String(form.get("billing_phone") ?? "").trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "Enter a valid billing email." };
  if (phone.length > 40 || !isValidCheckoutPhone(phone)) return { error: "Enter a valid contact phone number with its country code if needed." };

  let operationId: string;
  let expectedTotal: string;
  let addressId: string | null = null;
  let newAddress: ReturnType<typeof addressFromForm> | null = null;
  try {
    operationId = uuid(form.get("operation_id"), "Checkout request");
    expectedTotal = bdtAmount(form.get("expected_total"));
    if (form.get("address_id") === "new") {
      form.set("phone", phone);
      newAddress = addressFromForm(form);
      if (!newAddress.postal_code || !/^[A-Z]{2}$/.test(newAddress.country_code)) {
        return { error: "Enter a postcode and a two-letter country code." };
      }
    } else {
      addressId = uuid(form.get("address_id"), "Shipping address");
    }
  } catch {
    return { error: "Review the amount and complete the delivery details before paying." };
  }

  const fingerprint = createHash("sha256").update(JSON.stringify([
    "product", profile.id, product.id, selection.variationId, selection.quantity, addressId, newAddress, email, phone, expectedTotal,
  ])).digest("hex");
  const { data: newOrderId, error } = await createSupabaseAdminClient().rpc("customer_checkout_product_eps", {
    actor_profile_id: profile.id,
    requested_address_id: addressId,
    requested_email: email,
    requested_phone: phone,
    requested_operation_id: operationId,
    requested_fingerprint: fingerprint,
    requested_expected_total: expectedTotal,
    requested_product_id: product.id,
    requested_variation_id: selection.variationId,
    requested_quantity: selection.quantity,
    requested_new_address: newAddress,
  });
  let orderId = newOrderId;
  if (error?.code === "P0001" && error.message.startsWith("An EPS payment for this product is already open")) {
    // The database serializes submissions, so parallel clicks still converge on one order.
    const existing = await findOpenProductEpsCheckout(profile.id, product.id, selection.variationId);
    if (!existing) redirect("/account/orders");
    const payPath = `/account/orders/${existing.order_id}/pay`;
    if (existing.expired) {
      redirect(`${payPath}?from=powersemi-expired`);
    }
    if (existing.fingerprint !== fingerprint ||
        Number(existing.total_amount) !== Number(expectedTotal) ||
        Number(existing.quantity) !== selection.quantity) {
      redirect(`${payPath}?from=powersemi-selection`);
    }
    orderId = existing.order_id;
  } else if (error || !orderId) {
    return { error: checkoutErrorMessage(error) };
  }

  revalidatePath("/cart");
  revalidatePath("/account/orders");
  let checkoutUrl: string;
  try {
    checkoutUrl = await startEpsPayment(orderId, profile.id);
  } catch {
    redirect(`/account/orders/${orderId}/pay?error=${encodeURIComponent("Could not open EPS. Check your payment status or return the item to your cart.")}`);
  }
  redirect(checkoutUrl);
}
