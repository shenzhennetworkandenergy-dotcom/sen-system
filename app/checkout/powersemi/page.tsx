import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { EpsProductOrderForm, epsProductFormId } from "@/components/catalog/EpsProductOrderForm";
import { checkoutProductWithEps, type EpsProductCheckoutState } from "@/app/products/[slug]/eps-actions";
import { getCurrentProfile } from "@/lib/auth/session";
import { getPublicProduct } from "@/lib/catalog/products";
import { epsProductTotal } from "@/lib/orders/eps-product-checkout";
import { checkoutIntentSecret, openPowerSemiIntent, powerSemiCookieName, powerSemiResumePath } from "@/lib/orders/powersemi-checkout";
import { getPaymentOrigin } from "@/lib/payments/eps-config";
import { availableEpsGateway, findOpenProductEpsCheckout } from "@/lib/payments/eps-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function readIntent(id: string | undefined) {
  const local = getPaymentOrigin() === "http://127.0.0.1:3035" && process.env.EPS_LIVE_ENABLED !== "true";
  const token = (await cookies()).get(powerSemiCookieName(local))?.value;
  return openPowerSemiIntent(token, id, checkoutIntentSecret());
}

async function continuePowerSemiCheckout(id: string, expectedTotal: string,
  previous: EpsProductCheckoutState, form: FormData) {
  "use server";
  const intent = await readIntent(id);
  if (!intent) return { error: "This checkout expired. Start again from PowerSemi." };
  const product = await getPublicProduct(intent.slug);
  if (!product || product.businessCategory.slug !== "semiconductors" || product.product_type !== "simple") {
    return { error: "This product is no longer available on PowerSemi." };
  }
  form.set("operation_id", intent.id);
  form.set("quantity", String(intent.quantity));
  form.set("expected_total", expectedTotal);
  form.delete("variation_id");
  return checkoutProductWithEps({ id: product.id, slug: product.slug }, previous, form);
}

function Message({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-lg px-6 py-16">
    <p className="text-sm font-semibold">SEN · PowerSemi order</p>
    <h1 className="mt-2 text-2xl font-bold">EPS checkout</h1>
    <div className="mt-5 rounded-xl border p-5">{children}</div>
  </main>;
}

export default async function PowerSemiCheckout({searchParams}: {searchParams: Promise<{request?: string}>}) {
  const { request } = await searchParams;
  const intent = await readIntent(request);
  if (!intent) return <Message>This checkout has expired. Choose your product again on PowerSemi.</Message>;
  const { user, profile } = await getCurrentProfile();
  if (!user) redirect(`/login?${new URLSearchParams({ next: powerSemiResumePath(intent.id)! })}`);
  if (profile?.status !== "active" || profile.archived_at || !["customer", "admin"].includes(profile.role)) {
    return <Message>An active SEN customer account is required to order.</Message>;
  }

  const [product, gateway, { data: addresses, error }] = await Promise.all([
    getPublicProduct(intent.slug),
    availableEpsGateway(),
    createSupabaseAdminClient().from("customer_addresses")
      .select("id,recipient_name,phone,address_line_1,address_line_2,city,postal_code,country_code,is_default_shipping")
      .eq("profile_id", profile.id).order("is_default_shipping", { ascending: false }).order("created_at"),
  ]);
  const currentTotal = product && epsProductTotal(product.sale_price ?? product.regular_price, intent.quantity);
  if (!product || product.businessCategory.slug !== "semiconductors" || product.currency !== "BDT" ||
      product.product_type !== "simple" || !currentTotal) {
    return <Message>The selected quantity is no longer available at SEN. Check the product on PowerSemi and try again.</Message>;
  }
  if (product.available < intent.quantity &&
      !(await findOpenProductEpsCheckout(profile.id, product.id, null))) {
    return <Message>The selected quantity is no longer available at SEN. Check the product on PowerSemi and try again.</Message>;
  }
  if (!gateway || error) return <Message>EPS checkout is temporarily unavailable. Try again from PowerSemi.</Message>;
  const priceChanged = currentTotal !== intent.total;
  return <Message>
    <h2 className="font-semibold">{product.name}</h2>
    {priceChanged ? <p role="status" className="mt-3">The price changed. Review the updated total before continuing to EPS.</p> : null}
    <input type="hidden" form={epsProductFormId} name="quantity" value={intent.quantity} />
    <EpsProductOrderForm
      details={{ operationId: intent.id, signedIn: true, testMode: gateway.test_mode, email: profile.email ?? user.email ?? "", phone: profile.phone ?? "", addresses: addresses ?? [] }}
      selection={{ quantity: intent.quantity, variationId: null }}
      total={currentTotal}
      action={continuePowerSemiCheckout.bind(null, intent.id, currentTotal)}
      express={priceChanged ? "review" : "auto"}
    />
  </Message>;
}
