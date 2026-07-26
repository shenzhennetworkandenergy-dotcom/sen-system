import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/auth/permissions";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile } = await requireProfile();
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const { data } = await db
    .from("support_attachments")
    .select(
      "storage_path,support_messages(support_conversations(profile_id))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) redirect("/account/messages");

  const message = data.support_messages as unknown as {
    support_conversations: { profile_id: string } | null;
  } | null;
  const ownsConversation =
    message?.support_conversations?.profile_id === profile.id;
  const canSupport =
    profile.role === "admin" ||
    (profile.role === "employee" &&
      (await hasPermission(profile.id, "support.view")));
  if (!ownsConversation && !canSupport) redirect("/account");

  const { data: signed } = await db.storage
    .from("support-attachments")
    .createSignedUrl(data.storage_path, 60);
  if (!signed?.signedUrl) redirect("/account/messages");
  redirect(signed.signedUrl);
}
