import { connection } from "next/server";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/Shell";
import { SaleBuilder } from "@/components/sales/SaleBuilder";
import type { SaleEditInitial } from "@/components/sales/sale-builder-state";
import { requirePermission } from "@/lib/auth/permissions";
import { getOrderCreationOptions } from "@/lib/orders/data";
import { getSale, getSaleAccessOwner } from "@/lib/sales/data";
import {
  canAccessSaleUnderScope,
  resolveSalesVisibilityScope,
} from "@/lib/sales/visibility";

export const dynamic = "force-dynamic";

function addressLabel(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Saved Sale address";
  const address = value as Record<string, unknown>;
  return [address.recipient_name, address.address_line_1, address.city]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ") || "Saved Sale address";
}

export default async function EditSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("sales.edit");
  const [{ saleId }, notice] = await Promise.all([params, searchParams]);
  const saleAccess = await getSaleAccessOwner(saleId);
  if (!saleAccess) notFound();
  const scope = resolveSalesVisibilityScope({
    role: profile.role,
    status: profile.status,
    profileId: profile.id,
    permissions,
  });
  if (!canAccessSaleUnderScope(scope, saleAccess.createdBy)) notFound();
  const data = await getSale(saleId);
  if (!data || data.order.status !== "draft") notFound();

  const { order, items } = data;
  const options = await getOrderCreationOptions({
    customerId: order.customer_profile_id,
    addressIds: [order.shipping_address_id, order.billing_address_id]
      .filter((id): id is string => Boolean(id)),
    lines: items.map((item) => ({
      productId: item.product_id,
      variationId: item.variation_id,
    })),
  });
  const initialSale: SaleEditInitial = {
    saleId,
    orderNumber: order.order_number,
    updatedAt: order.updated_at,
    customerId: order.customer_profile_id,
    warehouseId: order.fulfillment_warehouse_id,
    addressId: order.shipping_address_id,
    billingAddressId: order.billing_address_id,
    shippingAddressLabel: addressLabel(order.shipping_address_snapshot),
    billingAddressLabel: addressLabel(order.billing_address_snapshot ?? order.shipping_address_snapshot),
    salesSource: order.sales_source,
    expectedDeliveryDate: order.expected_delivery_date,
    discountAmount: Number(order.discount_amount),
    shippingAmount: Number(order.shipping_amount),
    serviceAmount: Number(order.service_amount),
    taxAmount: Number(order.tax_amount),
    customerNotes: order.customer_notes,
    internalNotes: order.internal_notes,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      variationId: item.variation_id,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      discountType: item.discount_type === "percentage" ? "percentage" : "fixed",
      discountValue: Number(item.discount_value),
      lineDiscount: Number(item.line_discount),
      lineTax: Number(item.line_tax),
    })),
  };

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title={`Edit Sale ${order.order_number}`}
      subtitle="Reuse the Create Sale form to update products and pricing before final confirmation. Customer and commercial details remain locked."
    >
      {notice.error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{notice.error}</p> : null}
      {notice.success ? <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">{notice.success}</p> : null}
      <SaleBuilder {...options} initialSale={initialSale}/>
    </DashboardShell>
  );
}
