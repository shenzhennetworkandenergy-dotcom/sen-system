import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveGatewayAction } from "./actions";

export const dynamic = "force-dynamic";

type GatewayRow = {
  id: string;
  name: string;
  adapter: string;
  enabled: boolean;
  test_mode: boolean;
  display_order: number;
  secret_env_prefix: string;
  public_config: Record<string, unknown> | null;
};

export default async function PaymentSettings({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  await requireProfile(["admin"]);
  const notice = await searchParams;
  const { data, error } = await createSupabaseAdminClient()
    .from("payment_gateways")
    .select("*")
    .order("display_order");

  return (
    <DashboardShell
      admin
      title="Payment gateways"
      subtitle="Enable payment adapters without storing provider secrets in the database."
    >
      {notice.success ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-emerald-950">
          {notice.success}
        </p>
      ) : null}
      {notice.error || error ? (
        <p className="rounded-xl bg-red-50 p-4 text-red-950">
          {notice.error ?? "Unable to load payment gateways."}
        </p>
      ) : null}
      <p className="mt-4 rounded-xl border bg-amber-50 p-4 text-sm text-amber-950">
        Provider API keys remain server-only environment variables. Configure
        PREFIX_BASE_URL and PREFIX_API_KEY in local or Vercel settings before
        enabling an online gateway.
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {((data ?? []) as GatewayRow[]).map((gateway) => (
          <form
            key={gateway.id}
            action={saveGatewayAction.bind(null, gateway.id)}
            className="rounded-2xl border bg-[var(--surface)] p-5"
          >
            <h2 className="text-xl font-bold">{gateway.name}</h2>
            <p className="text-sm text-[var(--muted-text)]">
              Adapter: {gateway.adapter} · Environment prefix:{" "}
              {gateway.secret_env_prefix}
            </p>
            <div className="mt-4 grid gap-3">
              <label>
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={gateway.enabled}
                  className="mr-2"
                />
                Enabled
              </label>
              <label>
                <input
                  name="test_mode"
                  type="checkbox"
                  defaultChecked={gateway.test_mode}
                  className="mr-2"
                />
                Test mode
              </label>
              <label className="text-sm font-semibold">
                Display order
                <input
                  name="display_order"
                  type="number"
                  defaultValue={gateway.display_order}
                  className="mt-1 w-full rounded-lg border p-2"
                />
              </label>
              <label className="text-sm font-semibold">
                Description
                <input
                  name="description"
                  defaultValue={String(
                    gateway.public_config?.description ?? "",
                  )}
                  className="mt-1 w-full rounded-lg border p-2"
                />
              </label>
              <label className="text-sm font-semibold">
                Checkout API path
                <input
                  name="checkout_path"
                  defaultValue={String(
                    gateway.public_config?.checkout_path ?? "",
                  )}
                  className="mt-1 w-full rounded-lg border p-2"
                />
              </label>
            </div>
            <button className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 font-bold text-[var(--primary-foreground)]">
              Save gateway
            </button>
          </form>
        ))}
      </div>
    </DashboardShell>
  );
}
