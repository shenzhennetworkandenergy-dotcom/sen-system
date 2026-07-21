import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function SerialDetail({ params }: { params: Promise<{ id: string }> }) {
  const { profile, permissions } = await requirePermission("serials.view");
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const { data: serial } = await db.from("serial_numbers").select("*").eq("id", id).maybeSingle();
  if (!serial) notFound();
  const [{ data: product }, { data: variation }, { data: warehouse }, { data: movement }] = await Promise.all([
    db.from("products").select("id,name,sku").eq("id", serial.product_id).maybeSingle(),
    serial.variation_id ? db.from("product_variations").select("id,sku,combination_key").eq("id", serial.variation_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("warehouses").select("id,name,code,country_name").eq("id", serial.warehouse_id).maybeSingle(),
    serial.last_movement_id ? db.from("inventory_movements").select("id,reference,movement_type,created_at").eq("id", serial.last_movement_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = [["SEN serial", serial.sen_serial], ["Barcode", serial.barcode_value], ["Product", product ? `${product.name} (${product.sku})` : serial.product_id], ["Variation", variation ? `${variation.combination_key} (${variation.sku})` : "Parent product"], ["Warehouse", warehouse ? `${warehouse.name} (${warehouse.code})` : serial.warehouse_id], ["Status", serial.status], ["Condition", serial.condition], ["Acquisition reference", serial.acquisition_reference], ["Warranty start", serial.warranty_start], ["Warranty end", serial.warranty_end], ["Notes", serial.notes]];
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title={serial.manufacturer_serial} subtitle="Serialized stock identity and traceability record.">
    <section className="rounded-xl border bg-[var(--surface)] p-6"><dl className="grid gap-4 md:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="text-sm text-[var(--muted-text)]">{label}</dt><dd className="font-medium">{value ?? "-"}</dd></div>)}</dl></section>
    <section className="mt-6 rounded-xl border bg-[var(--surface)] p-6"><h2 className="text-xl font-semibold">Last movement</h2>{movement ? <p className="mt-3"><a href={`/admin/inventory/movements/${movement.id}`} className="font-semibold">{movement.reference}</a><span className="block text-sm text-[var(--muted-text)]">{movement.movement_type.replaceAll("_", " ")} - {new Date(movement.created_at).toLocaleString()}</span></p> : <p className="mt-3 text-[var(--muted-text)]">No movement reference is recorded.</p>}</section>
  </DashboardShell>;
}
