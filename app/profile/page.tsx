import Image from "next/image";
import { connection } from "next/server";

import {
  updateProfileMediaAction,
  updateProfileSectionAction,
} from "./actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { EmployeeWorkplaceSummary } from "@/components/hr/EmployeeWorkplaceSummary";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { getEmployeeWorkplaceSummary } from "@/lib/hr/profile-workplace";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const field = "sen-profile-field mt-1 w-full rounded-lg border px-3 py-2";
const emojis = ["🙂","😊","👤","👩‍💼","👨‍💼","👩‍🔧","👨‍🔧","🧑‍⚕️","🧑‍💻","🏢","⚡","🌐"];

type ProfileTone = "blue" | "cyan" | "emerald" | "violet" | "rose" | "amber";

function Section({
  title,
  description,
  tone,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  description: string;
  tone: ProfileTone;
  defaultOpen?: boolean;
  action: (form: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} data-profile-tone={tone} className="sen-profile-section">
      <summary className="sen-profile-section-summary">
        <span className="min-w-0">
          <h2 className="text-base font-bold">{title}</h2>
          <p className="mt-0.5 text-xs">{description}</p>
        </span>
        <span className="sen-profile-section-chevron" aria-hidden="true">⌄</span>
      </summary>
      <form action={action} className="sen-profile-section-form">
        <div className="grid gap-3 md:grid-cols-2">{children}</div>
        <button className="sen-profile-save-button">
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
  const [notice, { data }, permissions, workplaceSummary] = await Promise.all([
    searchParams,
    db.from("profiles").select("*").eq("id", profile.id).single(),
    profile.role === "employee"
      ? getEffectivePermissions(profile.id)
      : Promise.resolve(new Set<string>()),
    profile.role === "employee"
      ? getEmployeeWorkplaceSummary(profile.id)
      : Promise.resolve(null),
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
      <div className="sen-profile-page">
      {notice.success ? <p className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-950">{notice.success}</p> : null}
      {notice.error ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-950">{notice.error}</p> : null}

      <section className="sen-profile-hero">
        <div className="sen-profile-cover relative h-28 sm:h-36">
          {data.cover_path && urlMap.get(data.cover_path) ? <Image src={urlMap.get(data.cover_path)!} alt="Profile cover" fill unoptimized sizes="100vw" className="object-cover" /> : null}
        </div>
        <div className="sen-profile-identity relative px-4 pb-4 pt-12 sm:px-5 sm:pt-14">
          <div className="sen-profile-avatar absolute -top-12 left-4 grid h-24 w-24 place-items-center overflow-hidden rounded-full sm:left-5 sm:h-28 sm:w-28">
            {data.avatar_path && urlMap.get(data.avatar_path) ? <Image src={urlMap.get(data.avatar_path)!} alt={`${data.full_name ?? "User"} profile`} fill unoptimized sizes="112px" className="object-cover" /> : <span className="sen-profile-avatar-fallback">{data.avatar_emoji ?? "👤"}</span>}
          </div>
          <div className="sm:pl-32">
            <h2 className="text-xl font-bold sm:text-2xl">{data.full_name ?? "Add your name"}</h2>
            <p className="mt-0.5 text-sm text-[var(--muted-text)]">{data.bio ?? "Add a short introduction about yourself."}</p>
            <span className="sen-profile-role-badge">{data.role}</span>
          </div>
          <div className="sen-profile-media-grid mt-4 grid gap-3 lg:grid-cols-2">
            <form action={updateProfileMediaAction.bind(null,"avatar")} className="sen-profile-media-card">
              <h3 className="font-bold">Profile picture</h3>
              <p className="mt-0.5 text-xs text-[var(--muted-text)]">Choose an icon or upload your own photo.</p>
              <div className="sen-profile-emoji-list mt-2 flex flex-wrap gap-1.5">{emojis.map((emoji)=><label key={emoji} className="sen-profile-emoji-option"><input type="radio" name="avatar_emoji" value={emoji} defaultChecked={data.avatar_emoji===emoji} className="sr-only"/><span>{emoji}</span></label>)}</div>
              <CompressedImageInput name="image" label="Upload a photo" maxDimension={700} className="sen-profile-upload mt-2 block text-xs font-semibold"/>
              <button className="sen-profile-media-save">Save picture</button>
            </form>
            <form action={updateProfileMediaAction.bind(null,"cover")} className="sen-profile-media-card">
              <h3 className="font-bold">Cover image</h3>
              <p className="mt-0.5 text-xs text-[var(--muted-text)]">Your saved cover stays visible above your profile.</p>
              <CompressedImageInput name="image" label="Upload a cover image" maxDimension={1600} className="sen-profile-upload mt-2 block text-xs font-semibold"/>
              <button className="sen-profile-media-save">Save cover</button>
            </form>
          </div>
        </div>
      </section>

      {workplaceSummary ? <div className="mt-5"><EmployeeWorkplaceSummary summary={workplaceSummary} /></div> : null}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <Section title="About" tone="blue" defaultOpen description="The basic information shown at the top of your profile." action={updateProfileSectionAction.bind(null,"about")}>
          <label className="text-sm font-semibold">Full name<input name="full_name" required defaultValue={data.full_name ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Date of birth<input name="date_of_birth" type="date" defaultValue={data.date_of_birth ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Gender<select name="gender" defaultValue={data.gender ?? ""} className={field}><option value="">Prefer not to add</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
          <label className="text-sm font-semibold">Pronouns<input name="pronouns" defaultValue={data.pronouns ?? ""} placeholder="e.g. she/her, he/him" className={field}/></label>
          <label className="text-sm font-semibold md:col-span-2">Short bio<textarea name="bio" rows={3} defaultValue={data.bio ?? ""} className={field}/></label>
        </Section>
        <Section title="Contact" tone="cyan" defaultOpen description="Ways SEN can contact you. Your login email is read-only." action={updateProfileSectionAction.bind(null,"contact")}>
          <label className="text-sm font-semibold">Email<input value={data.email ?? ""} readOnly className={`${field} bg-slate-100`}/></label>
          <label className="text-sm font-semibold">Phone<input name="phone" type="tel" defaultValue={data.phone ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Alternate phone<input name="alternate_phone" type="tel" defaultValue={data.alternate_phone ?? ""} className={field}/></label>
        </Section>
        <Section title="Location" tone="emerald" description="Your general personal or business location." action={updateProfileSectionAction.bind(null,"location")}>
          <label className="text-sm font-semibold md:col-span-2">Address<input name="address_line" defaultValue={data.address_line ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">City<input name="city" defaultValue={data.city ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Region or state<input name="region" defaultValue={data.region ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Postal code<input name="postal_code" defaultValue={data.postal_code ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Country code<input name="country_code" maxLength={2} defaultValue={data.country_code ?? "BD"} className={field}/></label>
          <label className="text-sm font-semibold">Country<input name="country" defaultValue={data.country ?? data.country_name ?? "Bangladesh"} className={field}/></label>
        </Section>
        <Section title="Work" tone="violet" description="Company and professional information." action={updateProfileSectionAction.bind(null,"work")}>
          <label className="text-sm font-semibold">Company<input name="company_name" defaultValue={data.company_name ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Job title<input name="job_title" defaultValue={data.job_title ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Department<input name="department" defaultValue={data.department ?? ""} className={field}/></label>
          <label className="text-sm font-semibold md:col-span-2">Professional summary<textarea name="professional_summary" rows={3} defaultValue={data.professional_summary ?? ""} className={field}/></label>
        </Section>
        <Section title="Social links" tone="rose" description="Optional professional and contact links." action={updateProfileSectionAction.bind(null,"social")}>
          <label className="text-sm font-semibold">Facebook<input name="facebook" type="url" defaultValue={social.facebook ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">LinkedIn<input name="linkedin" type="url" defaultValue={social.linkedin ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Website<input name="website" type="url" defaultValue={social.website ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">WhatsApp<input name="whatsapp" type="tel" defaultValue={social.whatsapp ?? ""} className={field}/></label>
        </Section>
        <Section title="Emergency contact" tone="amber" description="A private contact for urgent situations." action={updateProfileSectionAction.bind(null,"emergency")}>
          <label className="text-sm font-semibold">Name<input name="emergency_contact_name" defaultValue={data.emergency_contact_name ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Relationship<input name="emergency_contact_relationship" defaultValue={data.emergency_contact_relationship ?? ""} className={field}/></label>
          <label className="text-sm font-semibold">Phone<input name="emergency_contact_phone" type="tel" defaultValue={data.emergency_contact_phone ?? ""} className={field}/></label>
        </Section>
      </div>
      </div>
    </DashboardShell>
  );
}
