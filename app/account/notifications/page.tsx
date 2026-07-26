import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  markAllNotificationsReadAction,
  openNotificationAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const { data } = await createSupabaseAdminClient()
    .from("customer_notifications")
    .select("id,title,message,href,notification_type,read_at,created_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const unread = (data ?? []).filter((item) => !item.read_at).length;

  return (
    <DashboardShell
      title="Notifications"
      subtitle="Order and support updates from SEN."
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <a href="/account" className="font-semibold text-[var(--primary)]">
          ← My Account
        </a>
        {unread ? (
          <form action={markAllNotificationsReadAction}>
            <button className="rounded-xl border px-4 py-2 text-sm font-bold">
              Mark all as read
            </button>
          </form>
        ) : null}
      </div>
      <div className="grid gap-3">
        {(data ?? []).map((item) => (
          <form
            key={item.id}
            action={openNotificationAction.bind(
              null,
              item.id,
              item.href ?? "/account/notifications",
            )}
          >
            <button
              className={`w-full rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                item.read_at
                  ? "bg-[var(--surface)]"
                  : "border-blue-300 bg-blue-50 shadow-sm ring-1 ring-blue-100"
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <strong className="block">{item.title}</strong>
                  <span className="mt-1 block text-sm text-slate-600">
                    {item.message}
                  </span>
                </span>
                {!item.read_at ? (
                  <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-bold uppercase text-white">
                    New
                  </span>
                ) : null}
              </span>
              <time className="mt-3 block text-xs text-slate-500">
                {new Date(item.created_at).toLocaleString()}
              </time>
            </button>
          </form>
        ))}
        {!data?.length ? (
          <p className="rounded-2xl border bg-[var(--surface)] p-10 text-center text-[var(--muted-text)]">
            You have no notifications yet.
          </p>
        ) : null}
      </div>
    </DashboardShell>
  );
}
