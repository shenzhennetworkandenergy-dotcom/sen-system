"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  sendFloatingMessageAction,
  startGeneralConversationAction,
} from "@/app/account/messages/actions";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";

type FloatingAttachment = {
  id: string;
  original_file_name: string;
  mime_type: string;
};

export type FloatingConversation = {
  id: string;
  subject: string;
  status: string;
  messages: {
    id: string;
    body: string;
    created_at: string;
    is_customer: boolean;
    attachments: FloatingAttachment[];
  }[];
} | null;

export function FloatingChat({
  authenticated,
  conversation,
}: {
  authenticated: boolean;
  conversation: FloatingConversation;
}) {
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("chat") === "open");

  return (
    <div className="sen-floating-chat">
      {open ? (
        <section
          className="sen-messenger-window"
          aria-label="Chat with SEN"
          aria-live="polite"
        >
          <header className="sen-messenger-header">
            <div className="sen-messenger-avatar" aria-hidden="true">
              S
            </div>
            <div className="min-w-0 flex-1">
              <strong className="block truncate">SEN Customer Care</strong>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <i className="h-2 w-2 rounded-full bg-emerald-500" /> We usually
                reply shortly
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="sen-messenger-icon-button"
            >
              ×
            </button>
          </header>

          {!authenticated ? (
            <div className="p-5 text-sm text-slate-700">
              <p>Sign in to message SEN and keep your conversation history.</p>
              <div className="mt-4 flex gap-2">
                <Link
                  href="/login"
                  className="rounded-full bg-blue-600 px-4 py-2 font-bold text-white"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-full border px-4 py-2 font-bold"
                >
                  Create account
                </Link>
              </div>
            </div>
          ) : conversation ? (
            <>
              <div className="sen-messenger-messages">
                <div className="mb-4 text-center">
                  <div className="sen-messenger-avatar mx-auto" aria-hidden="true">
                    S
                  </div>
                  <strong className="mt-2 block">SEN Customer Care</strong>
                  <span className="text-xs text-slate-500">
                    {conversation.subject}
                  </span>
                </div>
                {conversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`sen-messenger-row ${
                      message.is_customer ? "is-customer" : "is-sen"
                    }`}
                  >
                    <div className="sen-messenger-bubble">
                      <p>{message.body}</p>
                      {message.attachments.map((attachment) =>
                        attachment.mime_type.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={attachment.id}
                            src={`/support/attachments/${attachment.id}`}
                            alt={attachment.original_file_name}
                            className="mt-2 max-h-52 w-full rounded-xl object-cover"
                          />
                        ) : (
                          <a
                            key={attachment.id}
                            href={`/support/attachments/${attachment.id}`}
                            className="mt-2 block font-semibold underline"
                          >
                            {attachment.original_file_name}
                          </a>
                        ),
                      )}
                    </div>
                    <time>
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                ))}
              </div>
              {params.get("chatError") ? (
                <p className="px-4 pt-2 text-xs font-semibold text-red-700">
                  {params.get("chatError")}
                </p>
              ) : null}
              {params.get("chatSuccess") ? (
                <p className="px-4 pt-2 text-xs font-semibold text-emerald-700">
                  {params.get("chatSuccess")}
                </p>
              ) : null}
              <form
                action={sendFloatingMessageAction.bind(null, conversation.id)}
                className="sen-messenger-composer"
              >
                <CompressedImageInput
                  name="attachment"
                  label="＋"
                  accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/zip"
                  allowDocuments
                  className="sen-messenger-attachment"
                />
                <textarea
                  name="body"
                  rows={1}
                  placeholder="Aa"
                  aria-label="Message"
                />
                <button aria-label="Send message">➤</button>
              </form>
              <Link
                href={`/account/messages/${conversation.id}`}
                className="block border-t py-2 text-center text-xs font-bold text-blue-700"
              >
                Open full conversation
              </Link>
            </>
          ) : (
            <form
              action={startGeneralConversationAction}
              className="grid gap-3 p-4"
            >
              <div className="rounded-xl bg-blue-50 p-3 text-sm text-slate-700">
                Hello! Tell us how SEN can help you today.
              </div>
              <input
                name="subject"
                placeholder="Topic (optional)"
                maxLength={200}
                className="rounded-xl border p-3 text-slate-950"
              />
              <textarea
                name="message"
                rows={3}
                placeholder="Write a message..."
                className="rounded-xl border p-3 text-slate-950"
              />
              <CompressedImageInput
                name="attachment"
                label="Attach image or file"
                accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/zip"
                allowDocuments
                className="text-sm font-semibold text-blue-700"
              />
              <button className="rounded-full bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-500">
                Start conversation
              </button>
            </form>
          )}
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="sen-chat-trigger"
      >
        <span aria-hidden="true">💬</span>
        <span>{open ? "Close" : "Chat"}</span>
      </button>
    </div>
  );
}
