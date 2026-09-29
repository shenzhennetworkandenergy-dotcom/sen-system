import { DashboardShell } from "@/components/dashboard/Shell";
import { SerialScanner } from "@/components/inventory/SerialScanner";
import { SerialSearchField } from "@/components/inventory/SerialSearchField";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { profile, permissions } = await requirePermission("serials.view");
  const { q } = await searchParams;
  let results: Array<Record<string, unknown>> = [];
  if (q?.trim()) {
    const term = q.trim().replace(/^SEN:1:/, "").slice(0, 160);
    const normalized = term.replace(/[^A-Za-z0-9]/g, "");
    const { data, error } = await createSupabaseAdminClient().from("serial_numbers")
      .select("id,sen_serial,manufacturer_serial,status,condition,product_id,warehouse_id")
      .or(`sen_serial.ilike.%${term}%,manufacturer_serial.ilike.%${term}%,manufacturer_serial_normalized.ilike.%${normalized}%`).limit(10);
    if (error) throw new Error("Unable to search serials.");
    results = data ?? [];
  }
  return <DashboardShell admin={profile.role === "admin"} employeePermissions={profile.role === "employee" ? permissions : undefined} title="Scan serial" subtitle="Use manual input, debounced autocomplete, a keyboard scanner, or an explicitly activated camera.">
    <form className="mb-4 flex items-start gap-2"><SerialSearchField initialValue={q}/><button className="min-h-12 rounded bg-[var(--primary)] px-5 font-semibold text-[var(--primary-foreground)]">Search</button></form>
    <SerialScanner />
    {q ? <section className="mt-5 rounded-xl border bg-[var(--surface)] p-5"><h2 className="font-semibold">Results</h2>{results.length ? <ul className="mt-3 divide-y">{results.map((result) => <li key={String(result.id)} className="py-3"><a className="font-mono text-sm font-semibold" href={`/admin/serials/${result.id}`}>{String(result.sen_serial)}</a><span className="block text-sm">{String(result.manufacturer_serial ?? "Not provided")} · {String(result.status)} · {String(result.condition)}</span></li>)}</ul> : <p className="mt-3">No matching serials.</p>}</section> : null}
  </DashboardShell>;
}
