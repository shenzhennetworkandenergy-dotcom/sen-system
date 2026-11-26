"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { WhatsappDocument } from "@/lib/whatsapp/document-link";
import styles from "./company-whatsapp.module.css";

type Preview = {
  recipient: string;
  name: string;
  greeting: string;
  url: string;
  expiryNotice: string;
  token: string;
  windowOpen: boolean;
  requestId: string;
};

export function WhatsappDocumentButton({ document, issueFirst = false }: { document: WhatsappDocument; issueFirst?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const previewRequest = useRef<AbortController | null>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<{ accepted?: boolean; error?: string; uncertain?: boolean }>({});
  const action = document.kind === "quotation" ? "Send quotation to WhatsApp" : "Send sales invoice to WhatsApp";

  useEffect(() => {
    if (!open) return;
    const launcher = trigger.current;
    dialog.current?.showModal();
    return () => { previewRequest.current?.abort(); launcher?.focus(); };
  }, [open]);

  async function openPreview() {
    setOpen(true);
    if (issueFirst || status.accepted || status.uncertain) return;
    setPreview(null);
    setStatus({});
    const controller = new AbortController();
    previewRequest.current?.abort();
    previewRequest.current = controller;
    try {
      const response = await fetch("/api/admin/whatsapp/document", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ mode: "prepare", document }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load this document.");
      if (!controller.signal.aborted) setPreview(data as Preview);
    } catch (error) {
      if (!controller.signal.aborted) setStatus({ error: (error as Error).message });
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !preview?.windowOpen || status.accepted || status.uncertain) return;
    submitting.current = true;
    setSending(true);
    setStatus({});
    try {
      const response = await fetch("/api/admin/whatsapp/document", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "send", document, requestId: preview.requestId, recipient: preview.recipient, token: preview.token }),
      });
      const data = await response.json();
      setStatus(response.ok && data.accepted
        ? { accepted: true }
        : { error: data.error || "Could not confirm sending.", uncertain: !data.code || data.code === "unknown" });
    } catch {
      setStatus({ error: "The connection was interrupted. Check WhatsApp before sending again.", uncertain: true });
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  return <>
    <button ref={trigger} type="button" className={styles.launcher + " " + styles.inlineLauncher}
      onClick={openPreview} aria-haspopup="dialog">{action}</button>
    {open && <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
      onCancel={(event) => { if (submitting.current) event.preventDefault(); }}
      onClose={() => setOpen(false)}>
      <div className={styles.heading}>
        <h2 id={titleId}>{action}</h2>
        <button type="button" className={styles.close} onClick={() => dialog.current?.close()} disabled={sending} aria-label="Close WhatsApp">×</button>
      </div>
      <form className={styles.form} onSubmit={send}>
        {issueFirst && <p>Issue this quotation from Manage quotation before sending it to the customer.</p>}
        {!issueFirst && !preview && !status.error && <p role="status">Checking the document and customer…</p>}
        {preview && <>
          <div className={styles.fields}><label>Customer WhatsApp number
            <input type="tel" value={"+" + preview.recipient} readOnly />
          </label></div>
          <p>{preview.name}</p>
          <div className={styles.preview}>
            <b>Message preview</b>
            <p>{preview.greeting}</p>
            <a className="mt-2 inline-block font-semibold underline" href={preview.url} target="_blank" rel="noreferrer">Preview printable document</a>
            <p>{preview.expiryNotice}</p>
          </div>
          {!preview.windowOpen && <p className={styles.note}>Ask the customer to message SEN to open the 24-hour reply window.</p>}
        </>}
        {status.error && <p className={styles.error} role="alert">{status.error}</p>}
        {status.accepted && <p className={styles.success} role="status">Accepted by WhatsApp.</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => dialog.current?.close()} disabled={sending}>Close</button>
          {!issueFirst && <button type="submit" className={styles.primary}
            disabled={!preview?.windowOpen || sending || status.accepted || status.uncertain}>{sending ? "Sending…" : "Send now"}</button>}
        </div>
      </form>
    </dialog>}
  </>;
}
