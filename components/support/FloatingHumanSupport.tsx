"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  sendFloatingMessageAction,
  startGeneralConversationAction,
} from "@/app/account/messages/actions";
import type { FloatingConversation } from "@/components/support/FloatingChat";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";

export default function FloatingHumanSupport({
  conversation,
  pathname,
}: {
  conversation: FloatingConversation;
  pathname: string;
}) {
  const params = useSearchParams();
  return conversation ? (
    <>
      <div className="sen-messenger-messages">
        <div className="mb-4 text-center">
          <div className="sen-messenger-avatar mx-auto" aria-hidden="true">S</div>
          <strong className="mt-2 block">SEN Customer Care</strong>
          <span className="text-xs text-slate-500">{conversation.subject}</span>
        </div>
        {conversation.messages.map((item) => (
          <div key={item.id} className={`sen-messenger-row ${item.is_customer ? "is-customer" : "is-sen"}`}>
            <div className="sen-messenger-bubble">
              <p>{item.body}</p>
              {item.attachments.map((attachment) => attachment.mime_type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={attachment.id} src={`/support/attachments/${attachment.id}`} alt={attachment.original_file_name} className="mt-2 max-h-52 w-full rounded-xl object-cover" />
              ) : (
                <a key={attachment.id} href={`/support/attachments/${attachment.id}`} className="mt-2 block font-semibold underline">{attachment.original_file_name}</a>
              ))}
            </div>
            <time>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
        ))}
      </div>
      {params.get("chatError") ? <p className="px-4 pt-2 text-xs font-semibold text-red-700">{params.get("chatError")}</p> : null}
      {params.get("chatSuccess") ? <p className="px-4 pt-2 text-xs font-semibold text-emerald-700">{params.get("chatSuccess")}</p> : null}
      <form action={sendFloatingMessageAction.bind(null, conversation.id)} className="sen-messenger-composer">
        <input type="hidden" name="return_path" value={pathname} />
        <CompressedImageInput name="attachment" label="+" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/zip" allowDocuments className="sen-messenger-attachment" />
        <textarea name="body" rows={1} placeholder="Message SEN support" aria-label="Message SEN support" />
        <button aria-label="Send message">➤</button>
      </form>
      <Link href={`/account/messages/${conversation.id}`} className="block border-t py-2 text-center text-xs font-bold text-blue-700">Open full conversation</Link>
    </>
  ) : (
    <form action={startGeneralConversationAction} className="grid gap-3 p-4">
      <input type="hidden" name="return_path" value={pathname} />
      <div className="rounded-xl bg-blue-50 p-3 text-sm text-slate-700">Tell SEN Customer Care how we can help.</div>
      <input name="subject" placeholder="Topic (optional)" maxLength={200} className="rounded-xl border p-3 text-slate-950" />
      <textarea name="message" rows={3} placeholder="Write a message..." className="rounded-xl border p-3 text-slate-950" />
      <CompressedImageInput name="attachment" label="Attach image or file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/zip" allowDocuments className="text-sm font-semibold text-blue-700" />
      <button className="rounded-full bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-500">Start conversation</button>
    </form>
  );
}
