import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string; status?: string }>;
}) {
  await connection();
  await requirePermission("support.view");
  const params = await searchParams;
  const db = createSupabaseAdminClient();
  let query = db
    .from("support_conversations")
    .select(
      "id,reference,subject,status,last_message_at,profiles!support_conversations_profile_id_fkey(full_name,email),products(name)",
    )
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (params.status) query = query.eq("status", params.status);
  const { data, error } = await query;

  return (
    <DashboardShell
      admin
      title="Customer support"
      subtitle="Receive product questions, messages, images and documents."
    >
      {params.success ? (
        <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">
          {params.success}
        </p>
      ) : null}
      {params.error || error ? (
        <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">
          {params.error ?? "Unable to load support messages."}
        </p>
      ) : null}
      <form className="mb-5 flex gap-3 rounded-2xl border bg-[var(--surface)] p-4">
        <select
          name="status"
          defaultValue={params.status}
          className="rounded-xl border px-4 py-2.5"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="waiting_sen">Waiting for SEN</option>
          <option value="waiting_customer">Waiting for customer</option>
          <option value="closed">Closed</option>
        </select>
        <button className="rounded-xl border px-4 py-2.5 font-semibold">
          Filter
        </button>
      </form>
      <div className="overflow-x-auto rounded-2xl border bg-[var(--surface)]">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[var(--muted-surface)]">
            <tr>
              <th className="p-4">Reference</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Subject</th>
              <th className="p-4">Product</th>
              <th className="p-4">Status</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((conversation) => {
              const customer = conversation.profiles as unknown as {
                full_name: string | null;
                email: string | null;
              } | null;
              const product = conversation.products as unknown as {
                name: string;
              } | null;
              return (
                <tr key={conversation.id} className="border-t">
                  <td className="p-4 font-bold">{conversation.reference}</td>
                  <td className="p-4">
                    {customer?.full_name ?? "Customer"}
                    <span className="block text-xs text-[var(--muted-text)]">
                      {customer?.email}
                    </span>
                  </td>
                  <td className="p-4">{conversation.subject}</td>
                  <td className="p-4">{product?.name ?? "General"}</td>
                  <td className="p-4">{conversation.status.replaceAll("_", " ")}</td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/admin/support/${conversation.id}`}
                      className="rounded-lg border px-3 py-2 font-bold"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data?.length && !error ? (
          <p className="p-10 text-center">No support conversations found.</p>
        ) : null}
      </div>
    </DashboardShell>
  );
}
