"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/zip",
]);

export async function replyToConversationAction(
  conversationId: string,
  form: FormData,
) {
  const { profile } = await requirePermission("support.update");
  const db = createSupabaseAdminClient();
  const body = String(form.get("body") ?? "").trim().slice(0, 10000);
  const file = form.get("attachment");
  if (!body && !(file instanceof File && file.size)) {
    redirect(
      `/admin/messages?conversation=${conversationId}&error=Write%20a%20message%20first.`,
    );
  }
  const { data: conversation } = await db
    .from("support_conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) redirect("/admin/messages?error=Conversation%20not%20found.");

  const { data: message, error } = await db
    .from("support_messages")
    .insert({
      conversation_id: conversationId,
      sender_profile_id: profile.id,
      body: body || "Attachment",
    })
    .select("id")
    .single();
  if (error || !message) {
    redirect(
      `/admin/messages?conversation=${conversationId}&error=Unable%20to%20send%20message.`,
    );
  }

  if (file instanceof File && file.size) {
    if (file.size > 10485760 || !allowedTypes.has(file.type)) {
      redirect(
        `/admin/messages?conversation=${conversationId}&error=Unsupported%20attachment.`,
      );
    }
    const extension =
      file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 8) ||
      "bin";
    const path = `staff/${conversationId}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await db.storage
      .from("support-attachments")
      .upload(path, await file.arrayBuffer(), { contentType: file.type });
    if (!uploaded.error) {
      await db.from("support_attachments").insert({
        message_id: message.id,
        storage_path: path,
        original_file_name: file.name.slice(0, 200),
        mime_type: file.type,
        file_size: file.size,
      });
    }
  }

  await db
    .from("support_conversations")
    .update({
      assigned_to: profile.id,
      status: "waiting_customer",
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
  revalidatePath("/admin/messages");
  redirect(`/admin/messages?conversation=${conversationId}&success=Reply%20sent.`);
}

export async function closeConversationAction(conversationId: string) {
  await requirePermission("support.close");
  const { error } = await createSupabaseAdminClient()
    .from("support_conversations")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) {
    redirect(`/admin/messages?conversation=${conversationId}&error=Unable%20to%20close.`);
  }
  revalidatePath("/admin/messages");
  redirect(`/admin/messages?conversation=${conversationId}&success=Conversation%20closed.`);
}
