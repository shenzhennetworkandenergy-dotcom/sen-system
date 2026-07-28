"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function requestPasswordHelpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const message = String(formData.get("message") ?? "").trim().slice(0, 2000);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) redirect("/forgot-password?error=Enter%20a%20valid%20email%20and%20a%20short%20message.");
  const db = createSupabaseAdminClient();
  const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (profile) {
    const existing = await db.from("support_conversations").select("id").eq("profile_id", profile.id).eq("subject", "Password recovery help").in("status", ["open", "waiting_sen", "waiting_customer"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    let conversationId = existing.data?.id;
    if (!conversationId) {
      const created = await db.from("support_conversations").insert({ reference: `PASS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, profile_id: profile.id, subject: "Password recovery help", status: "waiting_sen" }).select("id").single();
      conversationId = created.data?.id;
    }
    if (conversationId) {
      await db.from("support_messages").insert({ conversation_id: conversationId, sender_profile_id: profile.id, body: `Password recovery request: ${message}` });
      await db.from("support_conversations").update({ status: "waiting_sen", last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conversationId);
    }
  }
  redirect("/forgot-password?success=Your%20request%20was%20sent.%20An%20administrator%20will%20contact%20you%20if%20the%20account%20exists.");
}
