import Image from "next/image";
import { connection } from "next/server";

import {
  updateProfileMediaAction,
  updateProfileSectionAction,
} from "./actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const field = "mt-1 w-full rounded-xl border bg-white px-3 py-2.5";
const emojis = ["🙂","😊","👤","👩‍💼","👨‍💼","👩‍🔧","👨‍🔧","🧑‍⚕️","🧑‍💻","🏢","⚡","🌐"];

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action: (form: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <details open className="rounded-2xl border bg-[var(--surface)] p-5">
      <summary className="cursor-pointer list-none">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--muted-text)]">{description}</p>
      </summary>
      <form action={action} className="mt-5">
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
        <button className="mt-5 rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">
          Save {title.toLowerCase()}
        </button>
      </form>
    </details>
  );
}

export default async function SharedProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "employee", "admin"]);
  const db = createSupabaseAdminClient();
  const [notice, { data }, permissions] = await Promise.all([
    searchParams,
    db.from("profiles").select("*").eq("id", profile.id).single(),
    profile.role === "employee"
      ? getEffectivePermissions(profile.id)
      : Promise.resolve(new Set<string>()),
  ]);
  const paths = [data.avatar_path, data.cover_path].filter(
    (path): path is string => Boolean(path),
  );
  const { data: signed } = paths.length
    ? await db.storage.from("profile-avatars").createSignedUrls(paths, 3600)
    : { data: [] };
  const urlMap = new Map(
    (signed ?? []).map((item) => [item.path, item.signedUrl]),
  );
  const social = (data.social_links ?? {}) as Record<string, string>;

  return (
    <DashboardShell
      admin={profile.role === "admin"}
      employeePermissions={profile.role === "employee" ? permissions : undefined}
      title="My Profile"
      subtitle="Add and update your personal information, photo, work details and contacts."
    >
      {notice.success ? <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-950">{notice.success}</p> : null}
      {notice.error ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-950">{notice.error}</p> : null}

      <section className="relative overflow-hidden rounded-3xl border bg-[var(--surface)] shadow-sm">
        <div className="relative h-40 bg-gradient-to-r from-[#07152f] via-[#0d4f78] to-[#2e75d4] sm:h-56">
          {data.cover_path && urlMap.get(data.cover_path) ? <Image src={urlMap.get(data.cover_path)!} alt="Profile cover" fill unoptimized sizes="100vw" className="object-cover" /> : null}
        </div>
        <div className="relative px-5 pb-6 pt-16 sm:px-8 sm:pt-20">
          <div className="absolute -top-16 left-5 grid h-32 w-32 place-items-center overflow-hidden rounded-full border-4 border-white bg-slate-100 text-6xl shadow-lg sm:left-8 sm:h-36 sm:w-36">
            {data.avatar_path && urlMap.get(data.avatar_path) ? <Image src={urlMap.get(data.avatar_path)!} alt={`${data.full_name ?? "User"} profile`} fill unoptimized sizes="144px" className="object-cover" /> : data.avatar_emoji ?? "👤"}
          </div>
          <div className="sm:pl-40">
            <h2 className="text-2xl font-bold sm:text-3xl">{data.full_name ?? "Add your name"}</h2>
            <p className="mt-1 text-[var(--muted-text)]">{data.bio ?? "Add a short introduction about yourself."}</p>
            <span className="mt-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold capitalize text-blue-800">{data.role}</span>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <form action={updateProfileMediaAction.bind(null,"avatar")} className="rounded-xl border p-4">
              <h3 className="font-bold">Profile picture</h3>
              <div className="mt-3 flex flex-wrap gap-2">{emojis.map((emoji)=><label key={emoji} className="cursor-pointer rounded-lg border p-2 text-xl"><input type="radio" name="avatar_emoji" value={emoji} defaultChecked={data.avatar_emoji===emoji} className="sr-only"/>{emoji}</label>)}</div>
              <CompressedImageInput name="image" label="Upload a photo" maxDimension={700} className="mt-3 block text-sm font-semibold"/>
              <button className="mt-3 rounded-lg border px-4 py-2 font-bold">Save picture</button>
            </form>
            <form action={updateProfileMediaAction.bind(null,"cover")} className="rounded-xl border p-4">
              <h3 className="font-bold">Cover image</h3>
              <CompressedImageInput name="image" label="Upload a cover image" maxDimension={1600} className="mt-3 block text-sm font-semibold"/>
              <button className="mt-3 rounded-lg border px-4 py-2 font-bold">Save cover</button>
            </form>
          </div>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Section title="About" description="The basic information shown at the top of your profile." action={updateProfileSectionAction.bind(null,"about")}>
          <label className="text-sm font-semibold">Full name<input name="full_name" required defaultValue={data.full_name ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Date of birth<input name="date_of_birth" type="date" defaultValue={data.date_of_birth ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Gender<select name="gender" defaultValue={data.gender ?? ""} className={field}><option value="">Prefer not to add</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
          <label className="text-sm font-semibold">Pronouns<input name="pronouns" defaultValue={data.pronouns ?? ""} placeholder="e.g. she/her, he/him" className={field}/></label>
          <label className="text-sm font-semibold md:col-span-2">Short bio<textarea name="bio" rows={3} defaultValue={data.bio ?? ""} className={field}/></label>
        </Section>
        <Section title="Contact" description="Ways SEN can contact you. Your login email is read-only." action={updateProfileSectionAction.bind(null,"contact")}>
          <label className="text-sm font-semibold">Email<input value={data.email ?? ""} readOnly className={`${field} bg-slate-100`}/></label>
          <label className="text-sm font-semibold">Phone<input name="phone" type="tel" defaultValue={data.phone ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Alternate phone<input name="alternate_phone" type="tel" defaultValue={data.alternate_phone ?? ""} className={field}/></label>
        </Section>
        <Section title="Location" description="Your general personal or business location." action={updateProfileSectionAction.bind(null,"location")}>
          <label className="text-sm font-semibold md:col-span-2">Address<input name="address_line" defaultValue={data.address_line ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">City<input name="city" defaultValue={data.city ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Region or state<input name="region" defaultValue={data.region ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Postal code<input name="postal_code" defaultValue={data.postal_code ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Country code<input name="country_code" maxLength={2} defaultValue={data.country_code ?? "BD"} className={field}/></label>
          <label className="text-sm font-semibold">Country<input name="country_name" defaultValue={data.country_name ?? "Bangladesh"} className={field}/></label>
        </Section>
        <Section title="Work" description="Company and professional information." action={updateProfileSectionAction.bind(null,"work")}>
          <label className="text-sm font-semibold">Company<input name="company_name" defaultValue={data.company_name ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Job title<input name="job_title" defaultValue={data.job_title ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Department<input name="department" defaultValue={data.department ?? ""} className={field}/></label>
          <label className="text-sm font-semibold md:col-span-2">Professional summary<textarea name="professional_summary" rows={3} defaultValue={data.professional_summary ?? ""} className={field}/></label>
        </Section>
        <Section title="Social links" description="Optional professional and contact links." action={updateProfileSectionAction.bind(null,"social")}>
          <label className="text-sm font-semibold">Facebook<input name="facebook" type="url" defaultValue={social.facebook ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">LinkedIn<input name="linkedin" type="url" defaultValue={social.linkedin ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Website<input name="website" type="url" defaultValue={social.website ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">WhatsApp<input name="whatsapp" type="tel" defaultValue={social.whatsapp ?? ""} className={field}/></label>
        </Section>
        <Section title="Emergency contact" description="A private contact for urgent situations." action={updateProfileSectionAction.bind(null,"emergency")}>
          <label className="text-sm font-semibold">Name<input name="emergency_contact_name" defaultValue={data.emergency_contact_name ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Relationship<input name="emergency_contact_relationship" defaultValue={data.emergency_contact_relationship ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Phone<input name="emergency_contact_phone" type="tel" defaultValue={data.emergency_contact_phone ?? ""} className={field}/></label>
        </Section>
      </div>
    </DashboardShell>
  );
}
