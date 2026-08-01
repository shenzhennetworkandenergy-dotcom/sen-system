"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { writeAuditLog } from "@/lib/audit/log";
import { requireProfile } from "@/lib/auth/session";
import {
  normalizeProfileInput,
  normalizeSocialLinks,
} from "@/lib/profile/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const destination = (kind: "success" | "error", message: string) =>
  `/profile?${kind}=${encodeURIComponent(message)}`;
const sections = {
  about: ["full_name", "bio", "date_of_birth", "gender", "pronouns"],
  contact: ["phone", "alternate_phone"],
  location: [
    "address_line",
    "city",
    "region",
    "postal_code",
    "country_code",
    "country",
  ],
  work: [
    "company_name",
    "job_title",
    "department",
    "professional_summary",
  ],
  emergency: [
    "emergency_contact_name",
    "emergency_contact_relationship",
    "emergency_contact_phone",
  ],
} as const;
type ProfileSection = keyof typeof sections | "social";

function formObject(form: FormData, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, form.get(key)]));
}

export async function updateProfileSectionAction(
  section: ProfileSection,
  form: FormData,
) {
  const { profile } = await requireProfile(["customer", "employee", "admin"]);
  if (section !== "social" && !(section in sections))
    redirect(destination("error", "Invalid profile section."));
  let payload: Record<string, unknown>;
  try {
    payload =
      section === "social"
        ? {
            social_links: normalizeSocialLinks(
              formObject(form, [
                "facebook",
                "linkedin",
                "website",
                "whatsapp",
              ]),
            ),
          }
        : normalizeProfileInput(
            formObject(form, sections[section as keyof typeof sections]),
          );
  } catch (error) {
    redirect(
      destination(
        "error",
        error instanceof Error ? error.message : "Invalid profile information.",
      ),
    );
  }
  if (section === "about" && !payload.full_name)
    redirect(destination("error", "Full name is required."));
  const { error } = await createSupabaseAdminClient()
    .from("profiles")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", profile.id);
  if (error)
    redirect(destination("error", "Unable to update this profile section."));
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: "profile.section_updated",
    module: "users",
    entityType: "profile",
    entityId: profile.id,
    targetProfileId: profile.id,
    description: `${section} profile information updated.`,
    newValues: { section },
  });
  revalidatePath("/profile");
  revalidatePath("/account");
  revalidatePath("/admin", "layout");
  revalidatePath("/employee", "layout");
  redirect(destination("success", `${section} information updated.`));
}

const avatarEmojis = new Set([
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
]);

export async function updateProfileMediaAction(
  kind: "avatar" | "cover",
  form: FormData,
) {
  const { profile } = await requireProfile(["customer", "employee", "admin"]);
  const file = form.get("image");
  const emoji = String(form.get("avatar_emoji") ?? "👤");
  const db = createSupabaseAdminClient();
  const { data: current } = await db
    .from("profiles")
    .select("avatar_path,cover_path")
    .eq("id", profile.id)
    .maybeSingle();
  let storagePath: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (
      file.size > 2_097_152 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      redirect(
        destination("error", "Choose a JPG, PNG or WebP image up to 2 MB."),
      );
    }
    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
    storagePath = `${profile.id}/${kind}-${crypto.randomUUID()}.${extension}`;
    const { error } = await db.storage
      .from("profile-avatars")
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: file.type,
      });
    if (error) redirect(destination("error", `Unable to upload ${kind}.`));
  } else if (kind === "cover") {
    redirect(destination("error", "Choose a cover image."));
  }
  const previousPath =
    kind === "avatar" ? current?.avatar_path : current?.cover_path;
  const update =
    kind === "avatar"
      ? {
          avatar_kind: storagePath ? "upload" : "emoji",
          avatar_path: storagePath,
          avatar_emoji: avatarEmojis.has(emoji) ? emoji : "👤",
          updated_at: new Date().toISOString(),
        }
      : { cover_path: storagePath, updated_at: new Date().toISOString() };
  const { error } = await db.from("profiles").update(update).eq("id", profile.id);
  if (error) {
    if (storagePath)
      await db.storage.from("profile-avatars").remove([storagePath]);
    redirect(destination("error", `Unable to save ${kind}.`));
  }
  if (previousPath && previousPath !== storagePath)
    await db.storage.from("profile-avatars").remove([previousPath]);
  await writeAuditLog({
    actorId: profile.id,
    actorRole: profile.role,
    action: `profile.${kind}_updated`,
    module: "users",
    entityType: "profile",
    entityId: profile.id,
    targetProfileId: profile.id,
    description: `Profile ${kind} updated.`,
  });
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
  revalidatePath("/employee", "layout");
  redirect(destination("success", `${kind} updated.`));
}
