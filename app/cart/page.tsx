import Link from "next/link";
import { connection } from "next/server";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { CheckoutConfirmation } from "@/components/cart/CheckoutConfirmation";
import { Container } from "@/components/ui/Container";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const notice = await searchParams;
  const db = createSupabaseAdminClient();
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
    const variation = item.product_variations as unknown as CartVariation | null;
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
    <div className="public-experience">
      <PublicHeader />
      <main className="min-h-[70vh] bg-slate-50 py-12">
        <Container>
          <h1 className="text-4xl font-bold text-slate-950">Your cart</h1>
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
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]">
            <section className="space-y-3">
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
                    <div>
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
                    <form
                      action={updateCartAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="item_id" value={item.id} />
                      <input
                        name="quantity"
                        type="number"
                        min="0"
                        max="99"
                        defaultValue={item.quantity}
                        className="w-20 rounded-lg border p-2"
                      />
                      <button className="rounded-lg border px-3 py-2 font-semibold">
                        Update
                      </button>
                    </form>
                    <b>
                      {new Intl.NumberFormat("en-BD", {
                        style: "currency",
                        currency: "BDT",
                        maximumFractionDigits: 0,
                      }).format(price * Number(item.quantity))}
                    </b>
                  </article>
                );
              })}
              {!items?.length ? (
                <p className="rounded-2xl border bg-white p-10 text-center">
                  Your cart is empty.{" "}
                  <Link
                    href="/products"
                    className="font-bold text-blue-700"
                  >
                    Browse products
                  </Link>
                </p>
              ) : null}
            </section>
            <aside className="rounded-2xl border bg-white p-5">
              <h2 className="text-xl font-bold">Order summary</h2>
              <p className="mt-4 flex justify-between">
                <span>Subtotal</span>
                <b>
                  {new Intl.NumberFormat("en-BD", {
                    style: "currency",
                    currency: "BDT",
                    maximumFractionDigits: 0,
                  }).format(total)}
                </b>
              </p>
              {items?.length ? (
                <CheckoutConfirmation
                  action={checkoutAction}
                  addresses={addresses ?? []}
                  email={profile.email ?? ""}
                  phone={profile.phone ?? ""}
                />
              ) : null}
            </aside>
          </div>
        </Container>
      </main>
      <PublicFooter />
    </div>
  );
}
