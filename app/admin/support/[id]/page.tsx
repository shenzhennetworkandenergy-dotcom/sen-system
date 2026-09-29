import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import {
  closeConversationAction,
  replyToConversationAction,
} from "../actions";

export const dynamic = "force-dynamic";

type Attachment = { id: string; original_file_name: string };

export default async function SupportConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  await connection();
  await requirePermission("support.view");
  const { id } = await params;
  const notice = await searchParams;
  const db = createSupabaseAdminClient();
  const { data: conversation } = await db
    .from("support_conversations")
    .select(
      "*,profiles!support_conversations_profile_id_fkey(full_name,email,phone),products(name,slug)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();
  const { data: messages } = await db
    .from("support_messages")
    .select(
      "id,body,created_at,sender_profile_id,profiles(full_name,role),support_attachments(id,original_file_name)",
    )
    .eq("conversation_id", id)
    .order("created_at");

  return (
    <DashboardShell
      admin
      title={conversation.subject}
      subtitle={`${conversation.reference} · ${conversation.status}`}
    >
      <div className="flex flex-wrap justify-between gap-3">
        <Link href="/admin/support" className="font-bold text-[var(--primary)]">
          ← All support
        </Link>
        {conversation.status !== "closed" ? (
          <form action={closeConversationAction.bind(null, id)}>
            <button className="rounded-lg border px-4 py-2 font-bold">
              Close conversation
            </button>
          </form>
        ) : null}
      </div>
      {notice.success ? (
        <p className="mt-3 rounded-xl bg-emerald-50 p-3">{notice.success}</p>
      ) : null}
      {notice.error ? (
        <p className="mt-3 rounded-xl bg-red-50 p-3">{notice.error}</p>
      ) : null}
      <div className="mt-5 space-y-3">
        {(messages ?? []).map((message) => {
          const sender = message.profiles as unknown as {
            full_name: string | null;
            role: string;
          } | null;
          return (
            <article
              key={message.id}
              className={`max-w-3xl rounded-2xl p-4 ${
                sender?.role === "customer"
                  ? "bg-slate-100"
                  : "ml-auto bg-blue-50"
              }`}
            >
              <b>{sender?.full_name ?? sender?.role ?? "User"}</b>
              <p className="mt-1">{message.body}</p>
              <small className="text-slate-500">
                {new Date(message.created_at).toLocaleString()}
              </small>
              {message.support_attachments?.map((attachment: Attachment) => (
                <p key={attachment.id} className="mt-2 text-sm">
                  <Link
                    href={`/support/attachments/${attachment.id}`}
                    className="font-bold text-[var(--primary)]"
                  >
                    📎 {attachment.original_file_name}
                  </Link>
                </p>
              ))}
            </article>
          );
        })}
      </div>
      <form
        action={replyToConversationAction.bind(null, id)}
        className="mt-5 rounded-2xl border bg-[var(--surface)] p-5"
      >
        <label className="font-semibold">
          Reply
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
          Send reply
        </button>
      </form>
    </DashboardShell>
  );
}
