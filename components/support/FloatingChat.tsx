"use client";

import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { replyDelayMs } from "@/lib/chatbot/conversation";

const FloatingHumanSupport = dynamic(
  () => import("@/components/support/FloatingHumanSupport"),
  {
    ssr: false,
    loading: () => (
      <div className="sen-messenger-messages text-sm text-slate-600">
        Loading customer support…
      </div>
    ),
  },
);

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

type ChatbotProduct = {
  id: string;
  variationId: string | null;
  name: string;
  slug: string;
  sku: string;
  modelNumber: string | null;
  shortDescription: string | null;
  productType: string;
  price: number | null;
  priceMax: number | null;
  currency: string;
  available: boolean;
  availability: "in_stock" | "sourceable";
  variationLabel: string | null;
  attributes: Record<string, string>;
};

type SearchHistoryInput = {
  query: string;
  resultProductIds: string[];
};

type AssistantMessage = {
  id: string;
  sender: "assistant" | "visitor";
  text: string;
  delivery?: "sending" | "delivered";
  products?: ChatbotProduct[];
  confirmation?: ChatbotProduct;
};

type AssistantStep =
  | "search"
  | "confirm"
  | "whatsapp"
  | "consent"
  | "complete"
  | "cancelled"
  | "error";

type Inquiry = {
  id: string;
  number: string;
  token: string;
};

type SearchResult =
  | { matchType: "suggestions"; products: ChatbotProduct[] }
  | { matchType: "confirmation"; product: ChatbotProduct }
  | { matchType: "none" }
  | { matchType: "information"; answerBn: string; answerEn: string };

const welcome = `Assalamu Alaikum wa Rahmatullahi wa Barakatuh. Enter a product name, model, or specification.

আসসালামু আলাইকুম ওয়া রহমাতুল্লাহি ওয়া বারাকাতুহু। পণ্যের নাম, মডেল বা স্পেসিফিকেশন লিখুন।`;

const clarificationPrompt = `Please enter the exact model or more details.

সঠিক মডেল বা আরও বিস্তারিত তথ্য লিখুন।`;

const suggestionPrompt = `Select a product or enter the exact model.

একটি পণ্য নির্বাচন করুন অথবা সঠিক মডেল লিখুন।`;

const confirmationPrompt = `Are you looking for this product?

আপনি কি এই পণ্যটি খুঁজছেন?`;

const whatsappPrompt = `Please enter your WhatsApp number with country code.

দেশের কোডসহ WhatsApp নম্বর লিখুন।`;

const consentPrompt = `May SEN store this request and contact you on WhatsApp?

SEN কি এই অনুরোধ সংরক্ষণ করে WhatsApp-এ যোগাযোগ করতে পারবে?`;

const saveError = `We could not save your request. Please try again.

অনুরোধটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।`;

function message(
  sender: AssistantMessage["sender"],
  text: string,
  extras: Pick<AssistantMessage, "products" | "confirmation"> = {},
): AssistantMessage {
  return {
    id: crypto.randomUUID(),
    sender,
    text,
    delivery: sender === "visitor" ? "sending" : undefined,
    ...extras,
  };
}

function responseDelay() {
  return new Promise((resolve) => window.setTimeout(resolve, replyDelayMs()));
}

function whatsappIsValid(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.length <= 32 && /^\+?[0-9\s()\-]+$/.test(trimmed) && digits.length >= 7 && digits.length <= 15;
}

function normalizeWhatsapp(value: string) {
  const trimmed = value.trim();
  return `${trimmed.startsWith("+") ? "+" : ""}${trimmed.replace(/\D/g, "")}`;
}

function formattedPrice(product: ChatbotProduct) {
  if (product.price === null) return null;
  const formatter = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 });
  const start = formatter.format(product.price);
  if (product.priceMax !== null && product.priceMax > product.price) {
    return `${product.currency} ${start}–${formatter.format(product.priceMax)}`;
  }
  return `${product.currency} ${start}`;
}

function confirmedProductMessage(product: ChatbotProduct) {
  const identity = [
    product.modelNumber ? `Model / মডেল: ${product.modelNumber}` : null,
    product.sku ? `SKU: ${product.sku}` : null,
  ].filter(Boolean).join(" · ");
  const priceText = formattedPrice(product);
  const detail = product.shortDescription?.trim().slice(0, 180);
  const lines = [
    product.name,
    identity || null,
    priceText ? `Price / মূল্য: ${priceText}` : `Price on request / মূল্য জানতে যোগাযোগ করুন`,
    product.available
      ? `Available in Bangladesh / বাংলাদেশে পাওয়া যাচ্ছে`
      : `SEN can arrange this product. / SEN এই পণ্যটি সংগ্রহ করে দিতে পারবে।`,
    detail || null,
    whatsappPrompt,
  ];
  return lines.filter(Boolean).join("\n");
}

function ProductAssistant({ closeChat }: { closeChat: () => void }) {
  const pathname = usePathname();
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "welcome", sender: "assistant", text: welcome },
  ]);
  const [step, setStep] = useState<AssistantStep>("search");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<ChatbotProduct | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryInput[]>([]);
  const [noMatchCount, setNoMatchCount] = useState(0);
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

  const addAssistant = (
    text: string,
    extras: Pick<AssistantMessage, "products" | "confirmation"> = {},
  ) => setMessages((current) => [...current, message("assistant", text, extras)]);

  const addVisitor = (text: string) =>
    setMessages((current) => [...current, message("visitor", text)]);

  const markDelivered = () =>
    setMessages((current) =>
      current.map((item) =>
        item.sender === "visitor" && item.delivery === "sending"
          ? { ...item, delivery: "delivered" }
          : item,
      ),
    );

  async function createInquiry(
    products: ChatbotProduct[],
    history: SearchHistoryInput[],
  ) {
    const response = await fetch("/api/chatbot/inquiry/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productQuery: originalQuery.current || products[0]?.name || "Product sourcing request",
        selectedProducts: products.map((product) => ({
          productId: product.id,
          variationId: product.variationId,
        })),
        searchHistory: history,
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
      return false;
    }
    setInquiry({
      id: result.inquiryId,
      number: result.inquiryNumber,
      token: result.updateToken,
    });
    return true;
  }

  async function searchProduct(query: string) {
    const response = await fetch(
      `/api/chatbot/search?q=${encodeURIComponent(query)}&sessionId=${encodeURIComponent(getSessionId())}&website=`,
      { headers: { accept: "application/json" } },
    );
    const result = (await response.json().catch(() => null)) as SearchResult | null;
    if (!response.ok || !result?.matchType) {
      addAssistant(`Product search is unavailable. Please try again.

পণ্য খোঁজা যাচ্ছে না। আবার চেষ্টা করুন।`);
      return;
    }
    if (result.matchType === "information") {
      addAssistant(`${result.answerEn}\n\n${result.answerBn}`);
      return;
    }

    const resultIds = result.matchType === "suggestions"
      ? result.products.map((product) => product.id)
      : result.matchType === "confirmation"
        ? [result.product.id]
        : [];
    const nextHistory = [...searchHistory, { query, resultProductIds: resultIds }].slice(-20);
    setSearchHistory(nextHistory);

    if (result.matchType === "suggestions") {
      setNoMatchCount(0);
      addAssistant(suggestionPrompt, { products: result.products });
      setStep("search");
      return;
    }
    if (result.matchType === "confirmation") {
      setNoMatchCount(0);
      setPendingProduct(result.product);
      addAssistant(`${result.product.name}\n\n${confirmationPrompt}`, {
        confirmation: result.product,
      });
      setStep("confirm");
      return;
    }

    const nextNoMatchCount = noMatchCount + 1;
    setNoMatchCount(nextNoMatchCount);
    if (nextNoMatchCount === 1) {
      addAssistant(clarificationPrompt);
      setStep("search");
      return;
    }
    addAssistant(`SEN can source this product. ${whatsappPrompt}

SEN পণ্যটি সংগ্রহ করতে পারবে।`);
    if (await createInquiry([], nextHistory)) setStep("whatsapp");
  }

  async function chooseProduct(product: ChatbotProduct) {
    if (busy) return;
    setBusy(true);
    addVisitor(product.name);
    try {
      await responseDelay();
      setPendingProduct(product);
      addAssistant(`${product.name}\n\n${confirmationPrompt}`, {
        confirmation: product,
      });
      setStep("confirm");
      markDelivered();
    } finally {
      setBusy(false);
    }
  }

  async function confirmProduct(confirmed: boolean) {
    if (busy || !pendingProduct) return;
    const product = pendingProduct;
    setBusy(true);
    addVisitor(confirmed ? "Yes / হ্যাঁ" : "No / না");
    try {
      await responseDelay();
      if (!confirmed) {
        setPendingProduct(null);
        addAssistant(clarificationPrompt);
        setStep("search");
        markDelivered();
        return;
      }
      addAssistant(confirmedProductMessage(product));
      if (await createInquiry([product], searchHistory)) setStep("whatsapp");
      markDelivered();
    } finally {
      setBusy(false);
    }
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
    addVisitor(value);
    setInput("");
    try {
      if (step === "search") {
        if (value.length < 2 || value.length > 500) {
          await responseDelay();
          addAssistant(`Enter 2–500 characters. / ২–৫০০ অক্ষর লিখুন।`);
          return;
        }
        if (!originalQuery.current) originalQuery.current = value;
        await responseDelay();
        await searchProduct(value);
        markDelivered();
      } else if (step === "whatsapp") {
        await responseDelay();
        if (!whatsappIsValid(value)) {
          addAssistant(`Enter a valid WhatsApp number with country code.

দেশের কোডসহ সঠিক WhatsApp নম্বর লিখুন।`);
          markDelivered();
          return;
        }
        const whatsapp = normalizeWhatsapp(value);
        if (!(await updateInquiry({ step: "whatsapp", whatsapp }))) {
          addAssistant(saveError);
          return;
        }
        addAssistant(consentPrompt);
        setStep("consent");
        markDelivered();
      }
    } finally {
      setBusy(false);
    }
  }

  async function consent(agreed: boolean) {
    if (busy || !inquiry) return;
    setBusy(true);
    addVisitor(agreed ? "Yes, I agree / হ্যাঁ, সম্মত" : "No / না");
    try {
      await responseDelay();
      const ok = await updateInquiry({ step: agreed ? "consent" : "cancel" });
      if (!ok) {
        addAssistant(saveError);
        return;
      }
      if (agreed) {
        addAssistant(`Saved. Reference: ${inquiry.number}

সংরক্ষিত হয়েছে। রেফারেন্স: ${inquiry.number}`);
        setStep("complete");
      } else {
        addAssistant(`Request cancelled. / অনুরোধ বাতিল হয়েছে।`);
        setStep("cancelled");
      }
      markDelivered();
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setMessages([{ id: crypto.randomUUID(), sender: "assistant", text: welcome }]);
    setStep("search");
    setInput("");
    setBusy(false);
    setPendingProduct(null);
    setSearchHistory([]);
    setNoMatchCount(0);
    setInquiry(null);
    originalQuery.current = "";
  }

  const placeholder = step === "whatsapp"
    ? "+8801712345678"
    : "Product name or model / পণ্যের নাম বা মডেল";

  return (
    <>
      <div ref={scrollRef} className="sen-messenger-messages" aria-live="polite">
        {messages.map((item) => (
          <div key={item.id} className={`sen-messenger-row ${item.sender === "visitor" ? "is-customer" : "is-sen"}`}>
            <div className="sen-messenger-bubble whitespace-pre-line">
              {item.text}
              {item.products?.length ? (
                <div className="sen-chat-product-list" data-testid="chatbot-product-suggestions">
                  {item.products.map((product) => (
                    <button
                      key={`${product.id}:${product.variationId ?? "parent"}`}
                      type="button"
                      data-testid="chatbot-product-option"
                      onClick={() => chooseProduct(product)}
                      disabled={busy}
                      className="sen-chat-product-option"
                    >
                      <strong>{product.name}</strong>
                      <span>{[product.modelNumber, product.sku].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {item.confirmation && pendingProduct?.id === item.confirmation.id && step === "confirm" ? (
                <div className="sen-chat-confirmation" data-testid="chatbot-confirmation">
                  <button
                    type="button"
                    data-testid="chatbot-confirm-yes"
                    onClick={() => confirmProduct(true)}
                    disabled={busy}
                  >
                    Yes / হ্যাঁ
                  </button>
                  <button
                    type="button"
                    data-testid="chatbot-confirm-no"
                    onClick={() => confirmProduct(false)}
                    disabled={busy}
                  >
                    No / না
                  </button>
                </div>
              ) : null}
            </div>
            {item.sender === "visitor" ? (
              <span className="sen-message-delivery" aria-label={item.delivery}>
                {item.delivery === "delivered" ? "Delivered ✓" : "Sending…"}
              </span>
            ) : null}
          </div>
        ))}
        {busy ? (
          <div className="sen-chat-typing" role="status" aria-label="SEN is preparing a reply">
            <span /><span /><span />
            <small>Preparing reply / উত্তর প্রস্তুত হচ্ছে</small>
          </div>
        ) : null}
      </div>

      {step === "search" || step === "whatsapp" ? (
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

      {step === "consent" ? (
        <div className="sen-chat-consent-actions">
          <button type="button" onClick={() => consent(true)} disabled={busy}>Yes, I agree / হ্যাঁ</button>
          <button type="button" onClick={() => consent(false)} disabled={busy}>No / না</button>
        </div>
      ) : null}
      {["complete", "cancelled", "error"].includes(step) ? (
        <div className="sen-chat-finish-actions">
          <button type="button" onClick={restart}>New search / নতুন অনুসন্ধান</button>
          <button type="button" onClick={closeChat}>Close / বন্ধ করুন</button>
        </div>
      ) : null}
    </>
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
          {tab === "assistant" ? <ProductAssistant closeChat={() => setOpen(false)} /> : <FloatingHumanSupport conversation={conversation} pathname={pathname} />}
        </section>
      ) : null}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Close SEN Product Assistant" : "Open SEN Product Assistant"} className="sen-chat-trigger">
        <span aria-hidden="true">💬</span><span>{open ? "Close" : "Product Assistant"}</span>
      </button>
    </div>
  );
}
