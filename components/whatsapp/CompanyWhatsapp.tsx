"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizeRecipient, templatePreview, type WhatsappTemplate } from "@/lib/whatsapp/messages";
import styles from "./company-whatsapp.module.css";
import { WhatsappInbox } from "./WhatsappInbox";

type Connection = { ready: boolean; inboxReady: boolean; replyOnly: boolean; requestId: string; businessNumber: string | null; templates: WhatsappTemplate[]; error?: string };
export type WhatsappDraft = { label: string; text: string; recipient?: string | null };

function WhatsappIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a9 9 0 0 1-13.4 7.8L3 21l1.7-4.5A9 9 0 1 1 21 11.5Z"/><path d="M8 7.5c0 4 2.5 6.5 6.5 7l1.5-2-2.5-1-1 1c-1.5-.7-2.3-1.5-3-3l1-1-1-2.5Z"/></svg>;
}

export function CompanyWhatsapp({ employee = false, draft, inline = false }: {
  employee?: boolean;
  draft?: WhatsappDraft;
  inline?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"compose" | "inbox">("compose");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(false);
  const [to, setTo] = useState(draft?.recipient ?? "");
  const [replyRecipient, setReplyRecipient] = useState("");
  const [text, setText] = useState(draft?.text ?? "");
  const [kind, setKind] = useState("text");
  const [templateKey, setTemplateKey] = useState("");
  const [parameters, setParameters] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ accepted?: boolean; error?: string; code?: string } | null>(null);
  const template = connection?.templates.find((item) => `${item.name}:${item.language}` === templateKey);
  const replyOnly = connection?.replyOnly ?? false;
  const useTemplate = !replyOnly && kind === "template";
  const canSend = Boolean(connection?.ready && (!replyOnly || replyRecipient));

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, [open]);

  useEffect(() => {
    if (!open || connection || result || sending) return;
    const controller = new AbortController();
    fetch("/api/admin/whatsapp", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check the WhatsApp connection.");
        const data = await response.json() as Connection;
        setConnection(data);
        setLoading(false);
      })
      .catch(() => { if (!controller.signal.aborted) { setResult({ error: "Could not check the WhatsApp connection. Close and reopen to try again." }); setLoading(false); } });
    return () => controller.abort();
  }, [open, connection, result, sending]);

  function close() {
    if (busy.current) return;
    setOpen(false);
    trigger.current?.focus();
  }

  function openComposer() {
    if (!result?.accepted && result?.code !== "unknown") {
      setConnection(null);
      setResult(null);
      setLoading(true);
    }
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !connection || !canSend || result?.accepted || result?.code === "unknown") return;
    let recipient: string;
    try { recipient = normalizeRecipient(replyOnly ? replyRecipient : to); }
    catch (error) { setResult({ error: (error as Error).message }); return; }
    if (useTemplate && (!template || parameters.length !== template.parameterCount || parameters.some((value) => !value.trim()))) {
      setResult({ error: "Choose a template and complete all its fields." }); return;
    }
    const message = useTemplate && template
      ? { kind, name: template.name, language: template.language, parameters }
      : { kind: "text", text };
    busy.current = true;
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: connection.requestId, to: recipient, ...message }) });
      const data = await response.json();
      setResult(response.ok && data.accepted ? { accepted: true } : { error: data.error ?? "The sending result could not be confirmed. Check the business account before sending again.", code: data.code ?? "unknown" });
    } catch {
      setResult({ error: "The connection was interrupted. Check the business account before sending again; this message may already have been accepted.", code: "unknown" });
    } finally { busy.current = false; setSending(false); }
  }

  function newMessage() {
    setConnection(null); setResult(null); setText(""); setParameters([]); setTemplateKey(""); setKind("text"); setLoading(true);
    setReplyRecipient("");
    if (replyOnly) setView("inbox");
  }

  return <>
    <button ref={trigger} type="button" className={`${styles.launcher}${inline ? ` ${styles.inlineLauncher}` : ""}`} onClick={openComposer} aria-haspopup="dialog"><WhatsappIcon/><span>{draft?.label ?? "WhatsApp"}</span></button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="company-whatsapp-title" aria-describedby="company-whatsapp-description"
      onCancel={(event) => { if (busy.current) event.preventDefault(); }} onClose={() => { setOpen(false); trigger.current?.focus(); }}>
      <div className={styles.heading}><div className={styles.headingTitle}><WhatsappIcon/><div><h2 id="company-whatsapp-title">Business WhatsApp</h2><p id="company-whatsapp-description">Prepare messages and view the customer inbox.</p></div></div><button type="button" onClick={close} disabled={sending} className={styles.close} aria-label="Close WhatsApp">×</button></div>
      <div className={styles.views} aria-label="WhatsApp view">
        <button type="button" aria-pressed={view === "compose"} disabled={sending} onClick={() => setView("compose")}>Compose</button>
        <button type="button" aria-pressed={view === "inbox"} disabled={sending} onClick={() => setView("inbox")}>Inbox</button>
      </div>
      {view === "inbox" ? open && <WhatsappInbox employee={employee} ready={Boolean(connection?.inboxReady)} recipient={to} onReply={(recipient) => {
        if (result?.code !== "unknown") newMessage();
        setTo(`+${recipient}`);
        setReplyRecipient(recipient);
        setView("compose");
      }} /> : <form onSubmit={submit} className={styles.form}>
        <div className={styles.connection} role="status">
          {loading ? "Checking connection…" : <>
            {connection?.businessNumber && <strong className={styles.number}>Company number: +{connection.businessNumber}</strong>}
            {connection?.error && <span className={styles.number}>{connection.error}</span>}
            <span>{connection?.ready ? (replyOnly ? "Inbox replies only" : "Ready to send") : "Sending is disabled. You can prepare a message here."}</span>
          </>}
        </div>
        <fieldset disabled={sending || result?.accepted || result?.code === "unknown"} className={styles.fields}>
          <label>Recipient WhatsApp number<input name="whatsapp_recipient" type="tel" inputMode="tel" autoComplete="off" placeholder={replyOnly ? "Select a message in the Inbox" : "+880 1XXXXXXXXX"} value={replyOnly ? (replyRecipient ? `+${replyRecipient}` : "") : to} onChange={(event) => setTo(event.target.value)} readOnly={replyOnly} required maxLength={40}/><small>{replyOnly ? "Choose Reply on an incoming message in the Inbox." : employee ? "Use a customer's saved phone number within your assigned business categories." : "Include the country code. Bangladesh mobile numbers can start with 01."}</small></label>
          {!replyOnly && <label>Message type<select value={kind} onChange={(event) => { setKind(event.target.value); setResult(null); }}><option value="text">Write a reply</option><option value="template">Approved template</option></select></label>}
          {!useTemplate ? <label>Message<textarea name="whatsapp_message" rows={5} value={text} onChange={(event) => setText(event.target.value)} required maxLength={4096} placeholder="Write your message…"/><small>Replies are available within 24 hours of the customer’s last WhatsApp message.{!replyOnly && " Use an approved template after that."}</small><span className={styles.count}>{text.length.toLocaleString()} / 4,096</span></label>
            : <>
              <label>Approved template<select value={templateKey} onChange={(event) => { const selected = connection?.templates.find((item) => `${item.name}:${item.language}` === event.target.value); setTemplateKey(event.target.value); setParameters(Array(selected?.parameterCount ?? 0).fill("")); }} required><option value="">Select a template</option>{connection?.templates.map((item) => <option key={`${item.name}:${item.language}`} value={`${item.name}:${item.language}`}>{item.name.replaceAll("_", " ")} ({item.language})</option>)}</select></label>
              {!connection?.templates.length ? <p className={styles.note}>No supported approved text templates are available. Your administrator can connect them in WhatsApp Manager.</p> : null}
              {parameters.map((value, index) => <label key={index}>Template field {index + 1}<input value={value} required maxLength={1024} onChange={(event) => setParameters((prior) => prior.map((item, position) => position === index ? event.target.value : item))}/></label>)}
              {template ? <div className={styles.preview}><strong>Message preview</strong><p>{templatePreview(template, parameters)}</p></div> : null}
            </>}
        </fieldset>
        {result?.error ? <p className={styles.error} role="alert">{result.error}</p> : null}
        {result?.accepted ? <p className={styles.success} role="status">Accepted by WhatsApp. Delivery has not been confirmed yet.</p> : null}
        <div className={styles.actions}><button type="button" className={styles.secondary} onClick={close} disabled={sending}>Close</button>{result?.accepted || (result?.code && result.code !== "unknown") ? <button type="button" className={styles.primary} onClick={newMessage}>{replyOnly ? "Back to Inbox" : "New message"}</button> : <button type="submit" className={styles.primary} disabled={!canSend || sending || result?.code === "unknown"}>{sending ? "Sending…" : replyOnly ? "Send reply" : "Send message"}</button>}</div>
      </form>}
    </dialog>
  </>;
}
