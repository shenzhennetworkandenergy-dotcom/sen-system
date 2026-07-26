import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";
import { requireProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { sendMessageAction } from "../actions";

export const dynamic = "force-dynamic";

type Attachment = { id: string; original_file_name: string };

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  const { profile } = await requireProfile(["customer", "admin"]);
  const { id } = await params;
  const notice = await searchParams;
  const db = createSupabaseAdminClient();
  const { data: conversation } = await db
    .from("support_conversations")
    .select("*")
    .eq("id", id)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: messages } = await db
    .from("support_messages")
    .select(
      "id,body,created_at,sender_profile_id,support_attachments(id,original_file_name,mime_type)",
    )
    .eq("conversation_id", id)
    .order("created_at");

  return (
    <DashboardShell
      title={conversation.subject}
      subtitle={`${conversation.reference} · ${conversation.status}`}
    >
      <Link href="/account/messages" className="font-bold text-[var(--primary)]">
        ← All messages
      </Link>
      {notice.success ? (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3">{notice.success}</p>
      ) : null}
      {notice.error ? (
        <p className="mt-3 rounded-xl bg-red-50 p-3">{notice.error}</p>
      ) : null}
      <div className="mt-5 space-y-3">
        {(messages ?? []).map((message) => (
          <article
            key={message.id}
            className={`max-w-3xl rounded-2xl p-4 ${
              message.sender_profile_id === profile.id
                ? "ml-auto bg-blue-50"
                : "bg-slate-100"
            }`}
          >
            <p>{message.body}</p>
            <small className="text-slate-500">
              {new Date(message.created_at).toLocaleString()}
            </small>
            {message.support_attachments?.map((attachment: Attachment) => (
              <p key={attachment.id} className="mt-2 text-sm font-semibold">
                <Link
                  href={`/support/attachments/${attachment.id}`}
                  className="text-[var(--primary)]"
                >
                  📎 {attachment.original_file_name}
                </Link>
              </p>
            ))}
          </article>
        ))}
      </div>
      <form
        action={sendMessageAction.bind(null, id)}
        className="mt-5 rounded-2xl border bg-[var(--surface)] p-5"
      >
        <label className="font-semibold">
          Message
          <textarea
            name="body"
            required
            rows={4}
            className="mt-1 w-full rounded-xl border p-3"
          />
        </label>
        <CompressedImageInput
          name="attachment"
          label="Optional image or file"
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/zip"
          allowDocuments
          className="mt-3 block text-sm font-semibold"
        />
        <button className="mt-4 rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">
          Send message
        </button>
      </form>
    </DashboardShell>
  );
}
