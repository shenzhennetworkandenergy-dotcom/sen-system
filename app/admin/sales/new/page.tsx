import { redirect } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { SaleBuilder } from "@/components/sales/SaleBuilder";
import { SourceQuotationSummary } from "@/components/sales/SourceQuotationSummary";
import { requireAllPermissions, requirePermission } from "@/lib/auth/permissions";
import { getOrderCreationOptions } from "@/lib/orders/data";
import {
  loadAccessibleConvertedSaleDestination,
  loadQuotationSaleInitial,
} from "@/lib/quotations/sale-conversion";
import {
  QUOTATION_SALE_CONVERSION_PERMISSIONS,
  type QuotationSaleInitial,
} from "@/lib/quotations/sale-conversion-types";
import { createBasicCustomerAction } from "../actions";

export const dynamic = "force-dynamic";

type NewSaleSearchParams = {
  success?: string | string[];
  error?: string | string[];
  quotation?: string | string[];
};

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<NewSaleSearchParams>;
}) {
  await connection();
  const { profile, permissions } = await requirePermission("sales.create");
  const notice = await searchParams;
  const quotationRequested = notice.quotation !== undefined;
  let initialQuotation: QuotationSaleInitial | undefined;

  if (quotationRequested) {
    await requireAllPermissions([...QUOTATION_SALE_CONVERSION_PERMISSIONS]);
    if (typeof notice.quotation !== "string" || !notice.quotation.trim()) {
      redirect("/admin/sales/from-quotation?error=Quotation%20is%20invalid.");
    }
    const loadedQuotation = await loadQuotationSaleInitial(notice.quotation);
    if (!loadedQuotation) {
      const existingSaleDestination =
        await loadAccessibleConvertedSaleDestination(notice.quotation);
      if (existingSaleDestination) redirect(existingSaleDestination);
      redirect("/admin/sales/from-quotation?error=Quotation%20is%20not%20eligible%20or%20accessible.");
    }
    initialQuotation = loadedQuotation;
  }

  const options = await getOrderCreationOptions(initialQuotation ? {
    customerId: initialQuotation.customerId,
    addressIds: [
      initialQuotation.shippingAddressId,
      initialQuotation.billingAddressId,
    ].filter((addressId): addressId is string => addressId !== null),
    lines: initialQuotation.lines.map((line) => ({
      productId: line.productId,
      variationId: line.variationId,
    })),
  } : undefined);
  if (initialQuotation) {
    const customerAvailable = options.customers.some(
      (customer) => customer.id === initialQuotation.customerId,
    );
    const availableAddressIds = new Set(options.addresses.map((address) => address.id));
    const shippingAddressAvailable = initialQuotation.shippingAddressId === null ||
      availableAddressIds.has(initialQuotation.shippingAddressId);
    const billingAddressAvailable = initialQuotation.billingAddressId === null ||
      availableAddressIds.has(initialQuotation.billingAddressId);
    if (!customerAvailable || !shippingAddressAvailable || !billingAddressAvailable) {
      redirect("/admin/sales/from-quotation?error=Quotation%20customer%20details%20are%20not%20available.");
    }
  }
  const success = typeof notice.success === "string" ? notice.success : undefined;
  const error = typeof notice.error === "string" ? notice.error : undefined;

  return <DashboardShell
    admin={profile.role === "admin"}
    employeePermissions={profile.role === "employee" ? permissions : undefined}
    title={initialQuotation ? "Create Sale from Quotation" : "Create Sale"}
    subtitle={initialQuotation
      ? "Review the approved quotation values in the existing Sales form before creating a draft."
      : "Build a BDT sale from existing customers, products, warehouse stock and delivery addresses."}
  >
    {success ? <p className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{success}</p> : null}
    {error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{error}</p> : null}
    {initialQuotation ? <SourceQuotationSummary quotation={initialQuotation}/> : null}
    {!initialQuotation ? <details className="mb-4 rounded-xl border bg-[var(--surface)] p-4">
      <summary className="cursor-pointer font-bold">Add a new customer</summary>
      <form action={createBasicCustomerAction} className="mt-3 grid gap-3 md:grid-cols-5">
        <input name="full_name" required placeholder="Full name" className="rounded-lg border px-3 py-2"/>
        <input name="email" type="email" required placeholder="Email" className="rounded-lg border px-3 py-2"/>
        <input name="phone" required placeholder="Phone" className="rounded-lg border px-3 py-2"/>
        <input name="address_line_1" required placeholder="Full address" className="rounded-lg border px-3 py-2"/>
        <button className="rounded-lg bg-[var(--primary)] px-4 py-2 font-semibold text-[var(--primary-foreground)]">Add customer</button>
        <p className="text-xs text-[var(--muted-text)] md:col-span-5">A default delivery address is created from the address above. The customer can add more details later in My Account.</p>
      </form>
    </details> : null}
    <SaleBuilder
      key={initialQuotation?.quotationId ?? "manual"}
      {...options}
      initialQuotation={initialQuotation}
    />
  </DashboardShell>;
}
