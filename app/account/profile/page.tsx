import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { updateAvatarAction, updateProfileAction } from "./actions";

export const dynamic = "force-dynamic";
const field = "mt-1 w-full rounded-xl border px-3 py-2.5";
const emojis = [
  "🙂",
  "😊",
  "👤",
  "👩‍💼",
  "👨‍💼",
  "👩‍🔧",
  "👨‍🔧",
  "🧑‍⚕️",
  "🧑‍💻",
  "🏢",
  "⚡",
  "🌐",
];

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "employee", "admin"]);
  const notice = await searchParams;
  const db = createSupabaseAdminClient();
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("id", profile.id)
    .single();
  const signed = data.avatar_path
    ? await db.storage
        .from("profile-avatars")
        .createSignedUrl(data.avatar_path, 3600)
    : null;

  return (
    <DashboardShell
      title="Edit profile"
      subtitle="Keep your customer and contact information current."
    >
      <Link href="/account" className="font-semibold text-[var(--primary)]">
        ← My Account
      </Link>
      {notice.success ? (
        <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-emerald-900">
          {notice.success}
        </p>
      ) : null}
      {notice.error ? (
        <p className="mt-4 rounded-xl bg-red-50 p-4 text-red-900">
          {notice.error}
        </p>
      ) : null}
      <div className="mt-4 grid gap-5 xl:grid-cols-[.7fr_1.3fr]">
        <form
          action={updateAvatarAction}
          className="rounded-2xl border bg-[var(--surface)] p-5"
        >
          <h2 className="text-lg font-bold">Profile picture</h2>
          <div className="relative my-5 grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-slate-100 text-6xl">
            {signed?.data?.signedUrl ? (
              <Image
                src={signed.data.signedUrl}
                alt="Profile"
                fill
                unoptimized
                sizes="112px"
                className="object-cover"
              />
            ) : (
              (data.avatar_emoji ?? "🙂")
            )}
          </div>
          <fieldset>
            <legend className="text-sm font-semibold">Choose an avatar</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {emojis.map((emoji) => (
                <label
                  key={emoji}
                  className="cursor-pointer rounded-xl border p-2 text-2xl hover:bg-slate-50"
                >
                  <input
                    type="radio"
                    name="avatar_emoji"
                    value={emoji}
                    defaultChecked={data.avatar_emoji === emoji}
                    className="sr-only"
                  />
                  {emoji}
                </label>
              ))}
            </div>
          </fieldset>
          <CompressedImageInput
            name="avatar"
            label="Or upload a photo"
            maxDimension={700}
            className="mt-5 block text-sm font-semibold"
          />
          <button className="mt-5 rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">
            Save profile picture
          </button>
        </form>
        <form
          action={updateProfileAction}
          className="rounded-2xl border bg-[var(--surface)] p-5"
        >
          <h2 className="text-lg font-bold">Personal information</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">
              Full name
              <input
                name="full_name"
                required
                defaultValue={data.full_name ?? ""}
                className={field}
              />
            </label>
            <label className="text-sm font-semibold">
              Email
              <input
                value={data.email ?? ""}
                disabled
                className={`${field} bg-slate-100`}
              />
            </label>
            <label className="text-sm font-semibold">
              Phone
              <input
                name="phone"
                defaultValue={data.phone ?? ""}
                className={field}
              />
            </label>
            <label className="text-sm font-semibold">
              Country code
              <input
                name="country_code"
                maxLength={2}
                defaultValue={data.country_code ?? "BD"}
                className={field}
              />
            </label>
            <label className="text-sm font-semibold">
              Country
              <input
                name="country_name"
                defaultValue={data.country_name ?? "Bangladesh"}
                className={field}
              />
            </label>
            <label className="text-sm font-semibold">
              Customer type
              <select
                name="customer_type"
                defaultValue={data.customer_type ?? "individual"}
                className={field}
              >
                <option value="individual">Individual</option>
                <option value="company">Company</option>
              </select>
            </label>
            <label className="text-sm font-semibold md:col-span-2">
              Company
              <input
                name="company_name"
                defaultValue={data.company_name ?? ""}
                className={field}
              />
            </label>
          </div>
          <button className="mt-5 rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">
            Save profile
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
