"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import {
  sendFloatingMessageAction,
  startGeneralConversationAction,
} from "@/app/account/messages/actions";
import { CompressedImageInput } from "@/components/uploads/CompressedImageInput";

type FloatingAttachment = { id: string; original_file_name: string; mime_type: string };
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

type AssistantMessage = {
  id: string;
  sender: "assistant" | "visitor";
  text: string;
};
type AssistantStep =
  | "search"
  | "phone"
  | "whatsapp"
  | "consent"
  | "complete"
  | "cancelled"
  | "error";
type Inquiry = {
  id: string;
  number: string;
  token: string;
  phone: string | null;
};

const welcome = `আসসালামু আলাইকুম ওয়া রহমাতুল্লাহি ওয়া বারাকাতুহু।

SEN-এ আপনাকে স্বাগতম। অনুগ্রহ করে প্রয়োজনীয় পণ্যের নাম, model number অথবা specification লিখুন।

Assalamu Alaikum wa Rahmatullahi wa Barakatuh.

Welcome to SEN. Please enter the product name, model number, or required specification.`;

const relatedMessage = `আপনার অনুরোধের সাথে সম্পর্কিত কিছু পণ্য পাওয়া গেছে, তবে সঠিক পণ্যটি নিশ্চিত করা যায়নি। অনুগ্রহ করে model number অথবা আরও নির্দিষ্ট specification লিখুন।

Some related products were found, but the exact product could not be confirmed. Please provide the model number or more specific specifications.`;

const unavailableMessage = `আমাদের Bangladesh warehouse-এ এই পণ্যটি নেই, তবে এটি আমাদের China warehouse-এ পাওয়া যাচ্ছে। অনুগ্রহ করে আপনার phone number এবং WhatsApp number প্রদান করুন। ইনশাআল্লাহ, যত দ্রুত সম্ভব আমরা আপনাকে পণ্যটির মূল্য জানাব।

We don't have this product in our Bangladesh warehouse, but it is available in our China warehouse. Please provide your phone number and WhatsApp number, and I will let you know the price as soon as possible, InshaAllah.`;

const phonePrompt = `অনুগ্রহ করে country code-সহ আপনার phone number লিখুন।

Please enter your phone number with the country code.`;

const whatsappPrompt = `আপনার WhatsApp number কি একই? একই হলে “Same” নির্বাচন করুন, অন্য হলে নতুন WhatsApp number লিখুন।

Is your WhatsApp number the same? Select “Same” or enter a different WhatsApp number.`;

const consentPrompt = `আপনার product request এবং contact information SEN CRM-এ সংরক্ষণ করা হবে এবং শুধুমাত্র এই product inquiry-এর বিষয়ে phone অথবা WhatsApp-এর মাধ্যমে যোগাযোগের জন্য ব্যবহার করা হবে। আপনি কি সম্মতি দিচ্ছেন?

Your product request and contact information will be stored in the SEN CRM and used only to contact you by phone or WhatsApp about this product inquiry. Do you agree?`;

const saveError = `দুঃখিত, এই মুহূর্তে আপনার request সংরক্ষণ করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।

Sorry, we could not save your request at this moment. Please try again shortly.`;

function message(sender: AssistantMessage["sender"], text: string): AssistantMessage {
  return { id: crypto.randomUUID(), sender, text };
}

function phoneIsValid(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.length <= 32 && /^\+?[0-9\s()\-]+$/.test(trimmed) && digits.length >= 7 && digits.length <= 15;
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  return `${trimmed.startsWith("+") ? "+" : ""}${trimmed.replace(/\D/g, "")}`;
}

function ProductAssistant({ closeChat }: { closeChat: () => void }) {
  const pathname = usePathname();
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", sender: "assistant", text: welcome },
  ]);
  const [step, setStep] = useState<AssistantStep>("search");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [clarificationUsed, setClarificationUsed] = useState(false);
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const originalQuery = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function getSessionId() {
    const key = "sen-product-assistant-session";
    let value = sessionStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      sessionStorage.setItem(key, value);
    }
    return value;
  }

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, step, busy]);

  const addAssistant = (text: string) =>
    setMessages((current) => [...current, message("assistant", text)]);

  async function startInquiry(productQuery: string) {
    addAssistant(unavailableMessage);
    const response = await fetch("/api/chatbot/inquiry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productQuery,
        sessionId: getSessionId(),
        submissionKey: crypto.randomUUID(),
        sourcePage: pathname,
        website: "",
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      inquiryId?: string;
      inquiryNumber?: string;
      updateToken?: string;
    } | null;
    if (!response.ok || !result?.ok || !result.inquiryId || !result.inquiryNumber || !result.updateToken) {
      addAssistant(saveError);
      setStep("error");
      return;
    }
    setInquiry({
      id: result.inquiryId,
      number: result.inquiryNumber,
      token: result.updateToken,
      phone: null,
    });
    addAssistant(phonePrompt);
    setStep("phone");
  }

  async function searchProduct(query: string) {
    const response = await fetch(
      `/api/chatbot/search?q=${encodeURIComponent(query)}&sessionId=${encodeURIComponent(getSessionId())}&website=`,
      { headers: { accept: "application/json" } },
    );
    const result = (await response.json().catch(() => null)) as {
      matchType?: "exact" | "related" | "none";
      available?: boolean;
      price?: number;
      currency?: string;
    } | null;
    if (!response.ok || !result?.matchType) {
      addAssistant(`দুঃখিত, এই মুহূর্তে product search করা যাচ্ছে না। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।

Sorry, product search is temporarily unavailable. Please try again shortly.`);
      return;
    }
    if (result.matchType === "exact" && result.available && typeof result.price === "number") {
      const currency = result.currency || "BDT";
      const formatted = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(result.price);
      addAssistant(`আলহামদুলিল্লাহ, জি—পণ্যটি পাওয়া যাচ্ছে। মূল্য: ${currency} ${formatted}।

Alhamdulillah, yes—the product is available. Price: ${currency} ${formatted}.`);
      addAssistant(`আপনি কি অন্য কোনো পণ্য খুঁজতে চান?

Would you like to search for another product?`);
      setStep("complete");
      return;
    }
    if (result.matchType === "related" && !clarificationUsed) {
      setClarificationUsed(true);
      addAssistant(relatedMessage);
      setStep("search");
      return;
    }
    await startInquiry(originalQuery.current || query);
  }

  async function updateInquiry(payload: Record<string, unknown>) {
    if (!inquiry) return false;
    const response = await fetch(`/api/chatbot/inquiry/${inquiry.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, updateToken: inquiry.token, website: "" }),
    });
    return response.ok;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const value = input.trim();
    if (!value) return;
    setBusy(true);
    try {
      if (step === "search") {
        if (value.length < 2 || value.length > 500) {
          addAssistant("অনুগ্রহ করে 2–500 অক্ষরের product request লিখুন।\n\nPlease enter a product request between 2 and 500 characters.");
          return;
        }
        if (!originalQuery.current) originalQuery.current = value;
        setMessages((current) => [...current, message("visitor", value)]);
        setInput("");
        await searchProduct(value);
      } else if (step === "phone") {
        if (!phoneIsValid(value)) {
          addAssistant("অনুগ্রহ করে country code-সহ একটি valid phone number লিখুন।\n\nPlease enter a valid phone number with the country code.");
          return;
        }
        const phone = normalizePhone(value);
        if (!(await updateInquiry({ step: "phone", phoneNumber: phone }))) {
          addAssistant(saveError);
          return;
        }
        setMessages((current) => [...current, message("visitor", phone)]);
        setInquiry((current) => current ? { ...current, phone } : current);
        setInput("");
        addAssistant(whatsappPrompt);
        setStep("whatsapp");
      } else if (step === "whatsapp") {
        if (!phoneIsValid(value)) {
          addAssistant("অনুগ্রহ করে একটি valid WhatsApp number লিখুন।\n\nPlease enter a valid WhatsApp number.");
          return;
        }
        const whatsapp = normalizePhone(value);
        if (!(await updateInquiry({ step: "whatsapp", whatsapp }))) {
          addAssistant(saveError);
          return;
        }
        setMessages((current) => [...current, message("visitor", whatsapp)]);
        setInput("");
        addAssistant(consentPrompt);
        setStep("consent");
      }
    } finally {
      setBusy(false);
    }
  }

  async function sameAsPhone() {
    if (busy || !inquiry?.phone) return;
    setBusy(true);
    try {
      if (!(await updateInquiry({ step: "whatsapp", whatsapp: inquiry.phone }))) {
        addAssistant(saveError);
        return;
      }
      setMessages((current) => [...current, message("visitor", "Same as phone")]);
      addAssistant(consentPrompt);
      setStep("consent");
    } finally {
      setBusy(false);
    }
  }

  async function consent(agreed: boolean) {
    if (busy || !inquiry) return;
    setBusy(true);
    try {
      const ok = await updateInquiry({ step: agreed ? "consent" : "cancel" });
      if (!ok) {
        addAssistant(saveError);
        return;
      }
      if (agreed) {
        addAssistant(`জাযাকাল্লাহু খাইরান। আপনার request সফলভাবে সংরক্ষিত হয়েছে। আপনার reference number হলো: ${inquiry.number}। ইনশাআল্লাহ, আমরা যত দ্রুত সম্ভব আপনার WhatsApp-এ পণ্যটির মূল্য জানাব।

JazakAllahu Khairan. Your request has been saved successfully. Your reference number is: ${inquiry.number}. InshaAllah, we will send you the product price on WhatsApp as soon as possible.`);
        setStep("complete");
      } else {
        addAssistant(`আপনার request বাতিল করা হয়েছে। আপনার contact information follow-up-এর জন্য ব্যবহার করা হবে না।

Your request has been cancelled. Your contact information will not be used for follow-up.`);
        setStep("cancelled");
      }
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setMessages([{ id: crypto.randomUUID(), sender: "assistant", text: welcome }]);
    setStep("search");
    setInput("");
    setBusy(false);
    setClarificationUsed(false);
    setInquiry(null);
    originalQuery.current = "";
  }

  const placeholder =
    step === "phone"
      ? "+8801712345678"
      : step === "whatsapp"
        ? "WhatsApp number"
        : "Product name, model or specification";

  return (
    <>
      <div ref={scrollRef} className="sen-messenger-messages" aria-live="polite">
        {messages.map((item) => (
          <div key={item.id} className={`sen-messenger-row ${item.sender === "visitor" ? "is-customer" : "is-sen"}`}>
            <div className="sen-messenger-bubble whitespace-pre-line">{item.text}</div>
          </div>
        ))}
        {busy ? <p className="mt-3 text-xs font-semibold text-slate-500">অনুগ্রহ করে অপেক্ষা করুন… / Please wait…</p> : null}
      </div>

      {step === "search" || step === "phone" || step === "whatsapp" ? (
        <form onSubmit={submit} className="sen-messenger-composer">
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, step === "search" ? 500 : 32))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={step === "search" ? 500 : 32}
            placeholder={placeholder}
            aria-label={placeholder}
            disabled={busy}
          />
          <button disabled={busy || !input.trim()} aria-label="Send">➤</button>
        </form>
      ) : null}

      {step === "whatsapp" ? (
        <div className="border-t px-3 py-2">
          <button type="button" onClick={sameAsPhone} disabled={busy} className="w-full rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-50">
            Same as phone
          </button>
        </div>
      ) : null}
      {step === "consent" ? (
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <button type="button" onClick={() => consent(true)} disabled={busy} className="rounded-full bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Yes, I agree</button>
          <button type="button" onClick={() => consent(false)} disabled={busy} className="rounded-full border px-3 py-2 text-sm font-bold disabled:opacity-50">No, cancel</button>
        </div>
      ) : null}
      {["complete", "cancelled", "error"].includes(step) ? (
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <button type="button" onClick={restart} className="rounded-full bg-blue-600 px-3 py-2 text-sm font-bold text-white">Search another product</button>
          <button type="button" onClick={closeChat} className="rounded-full border px-3 py-2 text-sm font-bold">Close chat</button>
        </div>
      ) : null}
    </>
  );
}

function HumanSupport({
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

export function FloatingChat({
  authenticated,
  conversation,
}: {
  authenticated: boolean;
  conversation: FloatingConversation;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(params.get("chat") === "open");
  const [tab, setTab] = useState<"assistant" | "support">("assistant");

  useEffect(() => {
    if (params.get("chat") === "open") {
      const timer = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(timer);
    }
    const openedKey = "sen-product-assistant-opened";
    if (!sessionStorage.getItem(openedKey)) {
      sessionStorage.setItem(openedKey, "1");
      const timer = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [params]);

  return (
    <div className="sen-floating-chat">
      {open ? (
        <section data-testid="product-assistant-window" className="sen-messenger-window" aria-label="SEN Product Assistant" aria-live="polite">
          <header className="sen-messenger-header">
            <div className="sen-messenger-avatar" aria-hidden="true">S</div>
            <div className="min-w-0 flex-1">
              <strong className="block truncate">{tab === "assistant" ? "SEN Product Assistant" : "SEN Customer Care"}</strong>
              <span className="flex items-center gap-1 text-xs text-slate-500"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Bilingual assistance</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="sen-messenger-icon-button">×</button>
          </header>
          {authenticated ? (
            <div className="grid grid-cols-2 border-b bg-slate-50 p-1">
              <button type="button" onClick={() => setTab("assistant")} aria-pressed={tab === "assistant"} className={`rounded-lg px-2 py-2 text-xs font-bold ${tab === "assistant" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>Product Assistant</button>
              <button type="button" onClick={() => setTab("support")} aria-pressed={tab === "support"} className={`rounded-lg px-2 py-2 text-xs font-bold ${tab === "support" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>Human Support</button>
            </div>
          ) : null}
          {tab === "assistant" ? <ProductAssistant closeChat={() => setOpen(false)} /> : <HumanSupport conversation={conversation} pathname={pathname} />}
        </section>
      ) : null}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Close SEN Product Assistant" : "Open SEN Product Assistant"} className="sen-chat-trigger">
        <span aria-hidden="true">💬</span><span>{open ? "Close" : "Product Assistant"}</span>
      </button>
    </div>
  );
}
