import { connection } from "next/server";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/Shell";
import { ShipmentBuilder } from "@/components/orders/ShipmentBuilder";
import { requirePermission } from "@/lib/auth/permissions";
import { getOrder } from "@/lib/orders/data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export default async function NewShipmentPage({ params }: { params: Promise<{ id: string }> }) { await connection(); await requirePermission("shipments.create"); const { id } = await params, data = await getOrder(id); if (!data) notFound(); const { data: locations, error } = await createSupabaseAdminClient().from("work_locations").select("id,name,country_code,city,latitude,longitude").eq("is_active", true).order("name"); if (error) throw new Error("Unable to load route locations."); return <DashboardShell admin title={`Create shipment · ${data.order.order_number}`} subtitle="Build a partial or complete shipment from packed order quantities."><a href={`/admin/orders/${id}`} className="mb-5 inline-block font-semibold text-[var(--primary)]">← Back to order</a><ShipmentBuilder orderId={id} items={data.items as never[]} allocations={data.allocations as never[]} locations={(locations ?? []) as never[]}/></DashboardShell>; }
