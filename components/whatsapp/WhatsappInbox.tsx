"use client";

import { useEffect, useState } from "react";
import type { WhatsappInboxMessage } from "@/lib/whatsapp/messages";
import styles from "./company-whatsapp.module.css";

export function WhatsappInbox({ employee, ready, recipient, onReply }: {
  employee: boolean;
  ready: boolean;
  recipient: string;
  onReply: (recipient: string) => void;
}) {
  const [phone, setPhone] = useState(recipient);
  const [filter, setFilter] = useState<{ from: string } | null>(() => employee && !recipient ? null : { from: recipient });
  const [result, setResult] = useState<{ messages?: WhatsappInboxMessage[]; error?: string } | null>(null);

  useEffect(() => {
    if (!filter || !ready) return;
    const controller = new AbortController();
    fetch("/api/admin/whatsapp/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(filter),
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (!controller.signal.aborted) {
        setResult(response.ok ? { messages: data.messages } : { error: data.error ?? "Could not load WhatsApp messages." });
      }
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ error: "Could not load WhatsApp messages. Try again." });
    });
    return () => controller.abort();
  }, [filter, ready]);

  if (!ready) return <div className={styles.form}><p className={styles.connection}>The WhatsApp inbox has not been connected yet.</p></div>;
  return <section className={styles.form} aria-label="Incoming WhatsApp messages">
    <form className={styles.inboxSearch} onSubmit={(event) => {
      event.preventDefault();
      setResult(null);
      setFilter({ from: phone.trim() });
    }}>
      <div className={styles.fields}><label>Customer WhatsApp number
        <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} required={employee} />
        <small>{employee ? "Use a customer's saved phone number." : "Leave blank to show recent incoming messages."}</small>
      </label></div>
      <div className={styles.actions}><button className={styles.secondary} type="submit">Load messages</button></div>
    </form>
    {filter && !result ? <p className={styles.note} role="status">Loading messages…</p> : null}
    {result?.error ? <p className={styles.error} role="alert">{result.error}</p> : null}
    {result?.messages?.length === 0 ? <p className={styles.note}>No incoming text messages found.</p> : null}
    {Boolean(result?.messages?.length) && <ul className={styles.inboxMessages}>
      {result?.messages?.map((message) => <li className={styles.preview} key={message.message_id}>
        <div className={styles.inboxMessageHeading}>
          <strong>+{message.sender}</strong>
          <time className={styles.note} dateTime={message.received_at}>{new Date(message.received_at).toLocaleString()}</time>
        </div>
        <p>{message.body}</p>
        <div className={styles.actions}><button className={styles.secondary} type="button" onClick={() => onReply(message.sender)}>Reply</button></div>
      </li>)}
    </ul>}
  </section>;
}
