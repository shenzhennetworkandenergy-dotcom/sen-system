import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { isAdmin, requirePermission } from "@/lib/auth/permissions";
import { cargoPackageUnits, getCargoOptions } from "@/lib/cargo-tracking/data";
import { createCargoCarrierAction, createCargoCustomerAction } from "../actions";
import { CargoJobForm } from "./CargoJobForm";

export const dynamic = "force-dynamic";
const field = "mt-1 w-full rounded-lg border bg-white px-3 py-2";

export default async function NewCargoJobPage({ searchParams }: { searchParams: Promise<{ customer?: string; carrier?: string; success?: string; error?: string }> }) {
  await connection();
  const { profile, permissions } = await requirePermission("cargo.create");
  const admin = isAdmin(profile);
  const params = await searchParams;
  const { customers, chinaWarehouses, bangladeshWarehouses, carriers } = await getCargoOptions();
  const selectedCarrier = carriers.find((carrier) => carrier.id === params.carrier);
  return <DashboardShell admin={admin} employeePermissions={admin ? undefined : permissions} title="Create Cargo Job" subtitle="Register a customer shipment without sales, inventory or accounting posting.">
    {params.success ? <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">{params.success}</p> : null}
    {params.error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900">{params.error}</p> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <CargoJobForm
        customers={customers}
        chinaWarehouses={chinaWarehouses}
        bangladeshWarehouses={bangladeshWarehouses}
        carriers={carriers}
        packageUnits={cargoPackageUnits}
        initialCustomerId={params.customer}
        initialCarrierName={selectedCarrier?.name}
      />
      {admin ? <div className="space-y-5">
        <form action={createCargoCustomerAction} className="space-y-3 rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Add shared customer</h2><p className="text-sm text-[var(--muted-text)]">This creates the same customer record used by Sales and Quotations.</p><input name="full_name" required placeholder="Full name" className={field} /><input name="company_name" placeholder="Company name (optional)" className={field} /><input name="email" type="email" required placeholder="Email" className={field} /><input name="phone" required placeholder="Phone" className={field} /><textarea name="address_line_1" required placeholder="Full address" rows={2} className={field} /><button className="w-full rounded-lg border px-4 py-2 font-bold">Add Customer</button></form>
        <form action={createCargoCarrierAction} className="space-y-3 rounded-xl border bg-[var(--surface)] p-5"><h2 className="text-lg font-bold">Add Carrier</h2><p className="text-sm text-[var(--muted-text)]">Adds an active carrier to the same shared master used by Purchasing.</p><input name="name" required maxLength={200} placeholder="Carrier name" className={field} /><input name="phone_number" required maxLength={60} placeholder="Phone number" className={field} /><textarea name="address" required maxLength={500} placeholder="Address" rows={2} className={field} /><textarea name="description" maxLength={1000} placeholder="Description (optional)" rows={2} className={field} /><button className="w-full rounded-lg border px-4 py-2 font-bold">Add Carrier</button></form>
      </div> : null}
    </div>
  </DashboardShell>;
}
