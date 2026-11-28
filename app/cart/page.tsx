import Link from "next/link";
import { connection } from "next/server";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { CheckoutConfirmation } from "@/components/cart/CheckoutConfirmation";
import { CartQuantityForm } from "@/components/cart/CartQuantityForm";
import { SavedCheckoutActions } from "@/components/cart/SavedCheckoutActions";
import { Container } from "@/components/ui/Container";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { availableEpsGateway, getRecoverableEpsCheckouts, hasEpsCheckoutExpired } from "@/lib/payments/eps-server";
import { money } from "@/lib/orders/types";
import { manageEpsCheckoutAction } from "@/app/account/orders/[id]/pay/actions";

import { checkoutAction, updateCartAction } from "./actions";

export const dynamic = "force-dynamic";

type CartProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  sale_price: number | null;
  regular_price: number | null;
  currency: string;
};

type CartVariation = {
  id: string;
  sku: string;
  combination_key: string;
  sale_price: number | null;
  regular_price: number | null;
};

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string; checkout?: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const notice = await searchParams;
  const db = createSupabaseAdminClient();
  const [eps, savedCheckouts] = await Promise.all([
    availableEpsGateway(),
    getRecoverableEpsCheckouts(profile.id),
  ]);
  const { data: cart } = await db
    .from("shopping_carts")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .maybeSingle();

  const [{ data: items }, { data: addresses }] = await Promise.all([
    cart
      ? db
          .from("shopping_cart_items")
          .select(
            "id,quantity,products(id,name,slug,sku,sale_price,regular_price,currency),product_variations(id,sku,combination_key,sale_price,regular_price)",
          )
          .eq("cart_id", cart.id)
      : Promise.resolve({ data: [] }),
    db
      .from("customer_addresses")
      .select(
        "id,recipient_name,phone,address_line_1,address_line_2,area,city,region,postal_code,country_code,is_default_shipping",
      )
      .eq("profile_id", profile.id)
      .order("is_default_shipping", { ascending: false }),
  ]);

  const total = (items ?? []).reduce((sum, item) => {
    const product = item.products as unknown as CartProduct;
    const variation =
      item.product_variations as unknown as CartVariation | null;
    return (
      sum +
      Number(item.quantity) *
        Number(
          variation?.sale_price ??
            variation?.regular_price ??
            product.sale_price ??
            product.regular_price ??
            0,
        )
    );
  }, 0);

  return (
    <>
      <PublicHeader />
      <main className="min-h-[70vh] bg-slate-50 py-12 text-slate-950">
        <Container>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-4xl font-bold text-slate-950">Your cart</h1>
            <Link href="/account/orders#checkout-requests" className="text-sm font-bold text-blue-800">My Orders</Link>
          </div>
          {notice.checkout === "removed-pending-review" ? (
            <p role="status" className="mt-4 rounded-xl bg-blue-50 p-4 text-blue-950">
              Checkout removed from your cart. SEN is checking the EPS payment.{" "}
              <Link href="/account/orders#checkout-requests" className="font-bold underline">Track the request in My Orders</Link>
            </p>
          ) : null}
          {notice.success ? (
            <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">
              {notice.success}
            </p>
          ) : null}
          {notice.error ? (
            <p className="mt-4 rounded-xl bg-red-50 p-4 text-red-900">
              {notice.error}
            </p>
          ) : null}
          {savedCheckouts.length > 0 ? (
            <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5" aria-labelledby="saved-checkouts">
              <h2 id="saved-checkouts" className="font-bold">Saved EPS checkouts</h2>
              <ul className="mt-3 space-y-2">
                {savedCheckouts.map(({ order_id, payment_expires_at, requested_change, sales_orders }) => {
                  const cancelled = sales_orders.status === "cancelled";
                  const expired = hasEpsCheckoutExpired(payment_expires_at);
                  const status = requested_change === "edit" ? "Edit requested"
                    : cancelled ? "Cancelled" : expired ? "Checkout window ended" : null;
                  return (
                    <li key={order_id} className="space-y-2 border-t border-blue-200 py-3">
                      <div className="flex flex-wrap items-center gap-x-4">
                        <span className="text-sm font-semibold">{sales_orders.order_number}</span>
                        <span className="text-sm font-semibold">{money(sales_orders.total_amount, sales_orders.currency)}</span>
                        {status ? <span className="text-sm text-slate-700">{status}</span> : null}
                      </div>
                      <p className="text-sm text-slate-700">
                        {sales_orders.sales_order_items.map(item => `${Number(item.quantity)} × ${item.product_name_snapshot}`).join(" · ")}
                      </p>
                      <form action={manageEpsCheckoutAction.bind(null, order_id)} className="flex flex-wrap gap-2">
                        <Link href={`/account/orders/${order_id}/pay`} className="inline-flex min-h-11 items-center rounded-lg bg-blue-800 px-3 py-2 text-sm font-bold text-white">
                          {requested_change ? "View request" : cancelled ? "View checkout" : expired ? "Check payment" : "Continue checkout"}
                        </Link>
                        {!requested_change ? <SavedCheckoutActions orderNumber={sales_orders.order_number} /> : null}
                      </form>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
            <section className="min-w-0 space-y-3">
              {(items ?? []).map((item) => {
                const product = item.products as unknown as CartProduct;
                const variation =
                  item.product_variations as unknown as CartVariation | null;
                const price = Number(
                  variation?.sale_price ??
                    variation?.regular_price ??
                    product.sale_price ??
                    product.regular_price ??
                    0,
                );
                return (
                  <article
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5"
                  >
                    <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">
                      <Link
                        href={`/products/${product.slug}`}
                        className="text-lg font-bold text-slate-950"
                      >
                        {product.name}
                      </Link>
                      {variation ? (
                        <p className="mt-1 text-sm font-medium text-blue-700">
                          {variation.combination_key}
                        </p>
                      ) : null}
                      <p className="text-sm text-slate-500">
                        {variation?.sku ?? product.sku}
                      </p>
                    </div>
                    <CartQuantityForm
                      action={updateCartAction}
                      itemId={item.id}
                      quantity={Number(item.quantity)}
                      productName={product.name}
                    />
                    <b>
                      {new Intl.NumberFormat("en-BD", {
                        style: "currency",
                        currency: "BDT",
                        maximumFractionDigits: 2,
                      }).format(price * Number(item.quantity))}
                    </b>
                  </article>
                );
              })}
              {!items?.length ? (
                <p className="rounded-2xl border bg-white p-10 text-center">
                  {savedCheckouts.length ? "Items from your EPS checkout are saved with the order above." : "Your cart is empty."}{" "}
                  <Link href="/products" className="font-bold text-blue-700">
                    Browse products
                  </Link>
                </p>
              ) : null}
            </section>
            {items?.length ? <aside className="rounded-2xl border bg-white p-5">
              <h2 className="text-xl font-bold">Order summary</h2>
              <p className="mt-4 flex justify-between">
                <span>Subtotal</span>
                <b>
                  {new Intl.NumberFormat("en-BD", {
                    style: "currency",
                    currency: "BDT",
                    maximumFractionDigits: 2,
                  }).format(total)}
                </b>
              </p>
              <CheckoutConfirmation
                  action={checkoutAction}
                  addresses={addresses ?? []}
                  email={profile.email ?? ""}
                  phone={profile.phone ?? ""}
                  eps={eps ? { testMode: eps.test_mode } : null}
                  operationId={crypto.randomUUID()}
                  total={total}
              />
            </aside> : null}
          </div>
        </Container>
      </main>
      <PublicFooter />
    </>
  );
}
