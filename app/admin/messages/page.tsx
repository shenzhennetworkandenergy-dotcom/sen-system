import Image from "next/image";
import { connection } from "next/server";

import {
  closeConversationAction,
  replyToConversationAction,
} from "@/app/admin/support/actions";
import { DashboardShell } from "@/components/dashboard/Shell";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Customer = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_emoji: string | null;
};
type Attachment = {
  id: string;
  original_file_name: string;
  mime_type: string;
};

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    conversation?: string;
    q?: string;
    status?: string;
    success?: string;
    error?: string;
  }>;
}) {
  await connection();
  await requirePermission("support.view");
  const params = await searchParams;
  const db = createSupabaseAdminClient();
  let query = db
    .from("support_conversations")
    .select(
      "id,reference,subject,status,last_message_at,profile_id,profiles!support_conversations_profile_id_fkey(full_name,email,phone,avatar_emoji),products(name,slug)",
    )
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (params.status) query = query.eq("status", params.status);
  if (params.q?.trim()) {
    query = query.ilike("subject", `%${params.q.trim().slice(0, 80)}%`);
  }
  const { data: conversations, error } = await query;
  const selectedId =
    params.conversation &&
    conversations?.some((item) => item.id === params.conversation)
      ? params.conversation
      : conversations?.[0]?.id;
  const selected = conversations?.find((item) => item.id === selectedId);
  const { data: messages } = selectedId
    ? await db
        .from("support_messages")
        .select(
          "id,body,created_at,sender_profile_id,profiles(full_name,role),support_attachments(id,original_file_name,mime_type)",
        )
        .eq("conversation_id", selectedId)
        .order("created_at")
    : { data: null };
  const customer = selected?.profiles as unknown as Customer | null;
  const product = selected?.products as unknown as {
    name: string;
    slug: string;
  } | null;

  return (
    <DashboardShell
      admin
      title="Messages"
      subtitle="Customer conversations, images and documents in one messenger workspace."
    >
      {params.success ? (
        <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">
          {params.success}
        </p>
      ) : null}
      {params.error || error ? (
        <p className="mb-3 rounded-xl bg-red-50 p-3 text-red-900">
          {params.error ?? "Unable to load support messages."}
        </p>
      ) : null}
      <div className="sen-admin-messenger">
        <aside className="sen-admin-chat-list">
          <div className="border-b p-4">
            <h2 className="text-xl font-bold">Chats</h2>
            <form className="mt-3 grid gap-2">
              <input
                name="q"
                defaultValue={params.q}
                placeholder="Search Messenger"
                className="rounded-full border bg-slate-100 px-4 py-2 text-sm"
              />
              <select
                name="status"
                defaultValue={params.status}
                className="rounded-full border px-4 py-2 text-sm"
              >
                <option value="">All chats</option>
                <option value="waiting_sen">Unread / waiting for SEN</option>
                <option value="waiting_customer">Waiting for customer</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
              <button className="sr-only">Filter</button>
            </form>
          </div>
          <nav aria-label="Customer conversations">
            {(conversations ?? []).map((conversation) => {
              const person = conversation.profiles as unknown as Customer | null;
              const active = conversation.id === selectedId;
              return (
                <a
                  key={conversation.id}
                  href={`/admin/messages?conversation=${conversation.id}`}
                  className={`sen-admin-chat-person ${active ? "is-active" : ""}`}
                >
                  <span className="sen-chat-person-avatar">
                    {person?.avatar_emoji ||
                      person?.full_name?.charAt(0) ||
                      "C"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate">
                      {person?.full_name || person?.email || "Customer"}
                    </strong>
                    <span className="block truncate text-xs text-slate-500">
                      {conversation.subject}
                    </span>
                  </span>
                  {conversation.status === "waiting_sen" ? (
                    <i
                      className="h-3 w-3 rounded-full bg-blue-600"
                      aria-label="Needs reply"
                    />
                  ) : null}
                </a>
              );
            })}
          </nav>
        </aside>

        <section className="sen-admin-chat-thread">
          {selected ? (
            <>
              <header className="flex items-center gap-3 border-b p-4">
                <span className="sen-chat-person-avatar">
                  {customer?.avatar_emoji ||
                    customer?.full_name?.charAt(0) ||
                    "C"}
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate">
                    {customer?.full_name || customer?.email || "Customer"}
                  </strong>
                  <span className="text-xs text-slate-500">
                    {selected.reference} ·{" "}
                    {selected.status.replaceAll("_", " ")}
                  </span>
                </div>
                {selected.status !== "closed" ? (
                  <form action={closeConversationAction.bind(null, selected.id)}>
                    <button className="rounded-full border px-3 py-2 text-xs font-bold">
                      Close chat
                    </button>
                  </form>
                ) : null}
              </header>
              <div className="sen-admin-chat-messages">
                <div className="mb-5 text-center">
                  <span className="sen-chat-person-avatar mx-auto text-xl">
                    {customer?.avatar_emoji ||
                      customer?.full_name?.charAt(0) ||
                      "C"}
                  </span>
                  <strong className="mt-2 block">
                    {customer?.full_name || customer?.email || "Customer"}
                  </strong>
                  <span className="text-xs text-slate-500">
                    {selected.subject}
                  </span>
                </div>
                {(messages ?? []).map((message) => {
                  const sender = message.profiles as unknown as {
                    role: string;
                  } | null;
                  const fromCustomer = sender?.role === "customer";
                  return (
                    <article
                      key={message.id}
                      className={`sen-admin-message-row ${
                        fromCustomer ? "is-customer" : "is-staff"
                      }`}
                    >
                      <div className="sen-admin-message-bubble">
                        <p>{message.body}</p>
                        {message.support_attachments?.map(
                          (attachment: Attachment) =>
                            attachment.mime_type.startsWith("image/") ? (
                              <a
                                key={attachment.id}
                                href={`/support/attachments/${attachment.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 block overflow-hidden rounded-xl"
                              >
                                <Image
                                  src={`/support/attachments/${attachment.id}`}
                                  alt={attachment.original_file_name}
                                  width={420}
                                  height={320}
                                  unoptimized
                                  loading="eager"
                                  className="max-h-72 w-auto max-w-full object-contain"
                                />
                              </a>
                            ) : (
                              <a
                                key={attachment.id}
                                href={`/support/attachments/${attachment.id}`}
                                className="mt-2 block rounded-lg bg-white/70 p-2 text-sm font-bold text-blue-700"
                              >
                                📎 {attachment.original_file_name}
                              </a>
                            ),
                        )}
                      </div>
                      <time>
                        {new Date(message.created_at).toLocaleString()}
                      </time>
                    </article>
                  );
                })}
              </div>
              <form
                action={replyToConversationAction.bind(null, selected.id)}
                className="sen-admin-chat-composer"
              >
                <CompressedImageInput
                  name="attachment"
                  label="Attach"
                  accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/zip"
                  allowDocuments
                  className="text-xs font-bold text-blue-700"
                />
                <textarea
                  name="body"
                  required
                  rows={1}
                  placeholder="Aa"
                  aria-label="Reply"
                />
                <button>Send</button>
              </form>
            </>
          ) : (
            <p className="grid h-full place-items-center p-10 text-slate-500">
              Choose a conversation to start messaging.
            </p>
          )}
        </section>

        <aside className="sen-admin-chat-info">
          {selected ? (
            <>
              <span className="sen-chat-person-avatar mx-auto text-2xl">
                {customer?.avatar_emoji ||
                  customer?.full_name?.charAt(0) ||
                  "C"}
              </span>
              <h2 className="mt-3 text-center text-lg font-bold">
                {customer?.full_name || "Customer"}
              </h2>
              <p className="text-center text-sm text-slate-500">
                {customer?.email}
              </p>
              <dl className="mt-6 space-y-4 text-sm">
                <div>
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="font-semibold">
                    {customer?.phone || "Not provided"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Regarding</dt>
                  <dd className="font-semibold">
                    {product?.name || "General enquiry"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-semibold capitalize">
                    {selected.status.replaceAll("_", " ")}
                  </dd>
                </div>
              </dl>
            </>
          ) : null}
        </aside>
      </div>
    </DashboardShell>
  );
}
