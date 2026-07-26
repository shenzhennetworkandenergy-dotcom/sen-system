"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/log";

const emojis = new Set(["🙂","😊","👤","👩‍💼","👨‍💼","👩‍🔧","👨‍🔧","🧑‍⚕️","🧑‍💻","🏢","⚡","🌐"]);
const text = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max) || null;
const destination = (kind: "success"|"error", message: string) => `/account/profile?${kind}=${encodeURIComponent(message)}`;

export async function updateProfileAction(form: FormData) {
  const { profile } = await requireProfile(["customer","employee","admin"]);
  const customerType = String(form.get("customer_type") ?? profile.customer_type ?? "individual");
  if (!["individual","company"].includes(customerType)) redirect(destination("error","Invalid customer type."));
  const payload = {
    full_name: text(form,"full_name",160), phone: text(form,"phone",60),
    country_code: (text(form,"country_code",2) ?? "BD").toUpperCase(), country_name: text(form,"country_name",100),
    customer_type: customerType, company_name: customerType === "company" ? text(form,"company_name",200) : null,
    updated_at: new Date().toISOString(),
  };
  if (!payload.full_name) redirect(destination("error","Name is required."));
  const db = createSupabaseAdminClient();
  const { error } = await db.from("profiles").update(payload).eq("id",profile.id);
  if (error) redirect(destination("error","Unable to update your profile."));
  await writeAuditLog({actorId:profile.id,actorRole:profile.role,action:"profile.updated",module:"users",entityType:"profile",entityId:profile.id,description:"User updated their profile."});
  revalidatePath("/account"); revalidatePath("/account/profile");
  redirect(destination("success","Profile updated."));
}

export async function updateAvatarAction(form: FormData) {
  const { profile } = await requireProfile(["customer","employee","admin"]);
  const emoji = String(form.get("avatar_emoji") ?? "🙂");
  const file = form.get("avatar");
  const db = createSupabaseAdminClient();
  const { data: current } = await db.from("profiles").select("avatar_path").eq("id",profile.id).maybeSingle();
  let update: {avatar_kind:"emoji"|"upload";avatar_emoji:string;avatar_path:string|null;updated_at:string};
  if (file instanceof File && file.size > 0) {
    if (file.size > 2097152 || !["image/jpeg","image/png","image/webp"].includes(file.type)) redirect(destination("error","Choose a JPG, PNG or WebP image up to 2 MB."));
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
    const uploaded = await db.storage.from("profile-avatars").upload(path,await file.arrayBuffer(),{contentType:file.type});
    if (uploaded.error) redirect(destination("error","Unable to upload profile image."));
    update={avatar_kind:"upload",avatar_emoji:emojis.has(emoji)?emoji:"🙂",avatar_path:path,updated_at:new Date().toISOString()};
    if (current?.avatar_path) await db.storage.from("profile-avatars").remove([current.avatar_path]);
  } else {
    if (!emojis.has(emoji)) redirect(destination("error","Choose an avatar from the list."));
    update={avatar_kind:"emoji",avatar_emoji:emoji,avatar_path:null,updated_at:new Date().toISOString()};
    if (current?.avatar_path) await db.storage.from("profile-avatars").remove([current.avatar_path]);
  }
  const { error } = await db.from("profiles").update(update).eq("id",profile.id);
  if (error) redirect(destination("error","Unable to save profile picture."));
  revalidatePath("/account"); revalidatePath("/account/profile");
  redirect(destination("success","Profile picture updated."));
}
