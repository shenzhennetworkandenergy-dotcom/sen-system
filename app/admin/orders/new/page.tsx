import { connection } from "next/server";
import { DashboardShell } from "@/components/dashboard/Shell";
import { OrderBuilder } from "@/components/orders/OrderBuilder";
import { requirePermission } from "@/lib/auth/permissions";
import { getOrderCreationOptions } from "@/lib/orders/data";
export const dynamic = "force-dynamic";
export default async function NewOrderPage(){ await connection(); await requirePermission("orders.create"); const options = await getOrderCreationOptions(); return <DashboardShell admin title="Create customer order" subtitle="Select a customer, snapshot the delivery address and add fulfilment-ready product lines."><OrderBuilder {...options}/></DashboardShell>; }
