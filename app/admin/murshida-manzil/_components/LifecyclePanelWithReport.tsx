import { LifecyclePanel as BaseLifecyclePanel } from "./LifecyclePanel";
import { getTenantAdvanceState } from "@/lib/murshida-manzil/repository";
import { SmartRentAdvancePanel } from "./SmartRentAdvancePanel";

export async function LifecyclePanel(props: Parameters<typeof BaseLifecyclePanel>[0]) {
  const states = Object.fromEntries(await Promise.all(props.tenants.filter((tenant) => tenant.is_active && tenant.unit_id).map(async (tenant) => [tenant.id, await getTenantAdvanceState(tenant.id)] as const)));
  return <><a className="mb-4 inline-block rounded border px-3 py-1.5 text-sm font-semibold" href="/admin/murshida-manzil/reports/owner-rent-account">Owner Rent Account</a><SmartRentAdvancePanel tenants={props.tenants} states={states} /><BaseLifecyclePanel {...props} /></>;
}
