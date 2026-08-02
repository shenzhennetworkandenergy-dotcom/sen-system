import Image from "next/image";
import Link from "next/link";

import { DashboardShell } from "@/components/dashboard/Shell";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const modules = [
  {
    label: "Notifications",
    href: "/account/notifications",
    description: "Read highlighted order and support updates.",
  },
  {
    label: "Edit Profile",
    href: "/account/profile",
    description: "Update your details and profile picture.",
  },
  {
    label: "Shipping Addresses",
    href: "/account/addresses",
    description: "Manage reusable delivery addresses.",
  },
  {
    label: "My Orders",
    href: "/account/orders",
    description: "View products, shipments, tracking and documents.",
  },
  {
    label: "Sales History",
    href: "/account/sales",
    description: "Purchases, payments and assigned serials.",
  },
  {
    label: "Quotations",
    href: "/account/quotations",
    description: "Track product quotation requests.",
  },
  {
    label: "Messages",
    href: "/account/messages",
    description: "Chat securely with the SEN team.",
  },
  {
    label: "Warranty & Returns",
    href: "/account/rma",
    description: "View warranty coverage and track your claims.",
  },
];

export default async function AccountPage() {
  const { profile } = await requireProfile(["customer", "admin"]);
  const db = createSupabaseAdminClient();
  const [{ data: addresses }, { data: fullProfile }, { count: unreadCount }] =
    await Promise.all([
    db
      .from("customer_addresses")
      .select("*")
      .eq("profile_id", profile.id)
      .order("is_default_shipping", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(3),
    db
      .from("profiles")
      .select("avatar_emoji,avatar_path")
      .eq("id", profile.id)
      .single(),
    db
      .from("customer_notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id)
      .is("read_at", null),
  ]);
  const signed = fullProfile?.avatar_path
    ? await db.storage
        .from("profile-avatars")
        .createSignedUrl(fullProfile.avatar_path, 3600)
    : null;

  return (
    <DashboardShell
      title="My Account"
      subtitle="Manage your SEN profile, delivery information and customer services."
    >
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-[var(--surface)] p-6 lg:col-span-2">
          <div className="flex items-center gap-4">
            <div className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-slate-100 text-4xl">
              {signed?.data?.signedUrl ? (
                <Image
                  src={signed.data.signedUrl}
                  alt="Profile"
                  fill
                  unoptimized
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                (fullProfile?.avatar_emoji ?? "🙂")
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold">Profile</h2>
              <Link
                href="/account/profile"
                className="text-sm font-semibold text-[var(--primary)]"
              >
                Edit profile →
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <p>
              <b>Name:</b> {profile.full_name ?? "Not provided"}
            </p>
            <p>
              <b>Email:</b> {profile.email}
            </p>
            <p>
              <b>Phone:</b> {profile.phone ?? "Not provided"}
            </p>
            <p>
              <b>Country:</b>{" "}
              {profile.country_name ?? profile.country_code ?? "Bangladesh"}
            </p>
            <p>
              <b>Customer type:</b> {profile.customer_type ?? "individual"}
            </p>
            <p>
              <b>Company:</b> {profile.company_name ?? "—"}
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">Saved addresses</h2>
          <div className="mt-3 space-y-3">
            {(addresses ?? []).map((address) => (
              <div
                key={address.id}
                className="rounded-lg bg-[var(--muted-surface)] p-3 text-sm"
              >
                <b>{address.map_label || address.recipient_name}</b>
                {address.is_default_shipping ? (
                  <span className="ml-2 text-xs text-emerald-700">Default</span>
                ) : null}
                <p>
                  {address.address_line_1}, {address.city} ·{" "}
                  {address.country_code}
                </p>
              </div>
            ))}
            {!addresses?.length ? (
              <p className="text-sm text-[var(--muted-text)]">
                No saved address yet.
              </p>
            ) : null}
          </div>
          <Link
            href="/account/addresses"
            className="mt-4 inline-block font-semibold text-[var(--primary)]"
          >
            Manage addresses →
          </Link>
        </div>
      </section>
      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {modules.map((item) => (
          <Link
            href={item.href}
            key={item.label}
            className="rounded-xl border bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <h3 className="font-semibold text-[var(--primary)]">
              {item.label}
              {item.href === "/account/notifications" && unreadCount
                ? ` (${unreadCount} new)`
                : ""}{" "}
              →
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-text)]">
              {item.description}
            </p>
          </Link>
        ))}
      </section>
    </DashboardShell>
  );
}
