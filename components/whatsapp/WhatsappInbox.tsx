"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { WhatsappContact } from "@/lib/whatsapp/directory";
import { isWhatsappReplyWindowOpen, type WhatsappInboxMessage } from "@/lib/whatsapp/messages";
import styles from "./company-whatsapp.module.css";
import { WhatsappContactEditor } from "./WhatsappContactEditor";
import { WhatsappContactImport } from "./WhatsappContactImport";
import { WhatsappPriceReply } from "./WhatsappPriceReply";
import { whatsappRequest } from "./whatsapp-request";

type DirectoryPage = { contacts: WhatsappContact[]; more: boolean; canQuote: boolean };
type InboxResult = { messages?: WhatsappInboxMessage[]; error?: string };
const PAGE_SIZE = 30;

export function WhatsappInbox({ employee, ready, initialContact, onReply }: {
  employee: boolean;
  ready: boolean;
  initialContact?: WhatsappContact | null;
  onReply: (contact: WhatsappContact, text?: string) => void;
}) {
  const [view, setView] = useState<"recent" | "contacts">("recent");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState<DirectoryPage | null>(null);
  const [listError, setListError] = useState("");
  const [selected, setSelected] = useState<WhatsappContact | null>(initialContact ?? null);
  const [inbox, setInbox] = useState<InboxResult | null>(null);
  const [editing, setEditing] = useState<WhatsappContact | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const selectedPhone = selected?.recipient;
  const canReply = Boolean(inbox?.messages?.some((item) => isWhatsappReplyWindowOpen(item.received_at)));

  function refresh() {
    setPage(null);
    setListError("");
    setRevision((value) => value + 1);
  }

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    whatsappRequest<DirectoryPage>("contacts", { mode: view, query, offset }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setPage(data); })
      .catch((error: Error) => { if (!controller.signal.aborted) setListError(error.message); });
    return () => controller.abort();
  }, [ready, view, query, offset, revision]);

  useEffect(() => {
    if (!selectedPhone || !ready) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = await whatsappRequest<{ messages: WhatsappInboxMessage[] }>("inbox", { from: selectedPhone }, controller.signal);
        if (!controller.signal.aborted) setInbox(data);
      } catch (error) {
        if (!controller.signal.aborted) setInbox({ error: (error as Error).message });
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 15_000);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selectedPhone, ready]);

  function loadView(next: "recent" | "contacts") {
    setView(next);
    setOffset(0);
    refresh();
  }

  function searchList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(search.trim());
    setOffset(0);
    refresh();
  }

  function select(contact: WhatsappContact | null) {
    setInbox(null);
    setSelected(contact);
    setEditing(null);
  }

  if (!ready) return <div className={styles.form}><p className={styles.connection}>The WhatsApp inbox has not been connected yet.</p></div>;
  return <section className={styles.form} aria-label="Incoming WhatsApp messages">
    {editing && <WhatsappContactEditor key={editing === "new" ? "new" : editing.recipient} contact={editing === "new" ? undefined : editing}
      onSaved={() => { setNotice("WhatsApp contact saved."); select(null); loadView("contacts"); }}
      onCancel={() => setEditing(null)} />}
    {notice && <p className={styles.success} role="status">{notice}</p>}
    {selected ? <>
      <div className={styles.inboxMessageHeading}>
        <h3 className={styles.contactTitle}>{selected.display_name ?? "+" + selected.recipient}</h3>
        <button className={styles.secondary + " " + styles.inlineAction} type="button" onClick={() => { select(null); refresh(); }}>Back to list</button>
      </div>
      <p className={styles.note}>{[selected.company_name, "+" + selected.recipient].filter(Boolean).join(" · ")}</p>
      {selected.ambiguous && <p className={styles.note}>Multiple ERP customers share this number. An administrator can link the correct customer.</p>}
      <div className={styles.actions}>
        {!employee && <button className={styles.secondary} type="button" onClick={() => setEditing(selected)}>Save or link contact</button>}
        {page?.canQuote && selected.customer_profile_id && <a className={styles.secondary + " " + styles.inlineAction}
          href={"/admin/quotations/new?customer=" + encodeURIComponent(selected.customer_profile_id)} target="_blank" rel="noopener">Create quotation</a>}
        <button className={styles.primary} type="button" disabled={!canReply} onClick={() => onReply(selected)}>Reply</button>
      </div>
      {canReply && <WhatsappPriceReply onSelect={(text) => onReply(selected, text)} />}
      {!inbox && <p className={styles.note} role="status">Loading messages…</p>}
      {inbox?.error && <p className={styles.error} role="alert">{inbox.error}</p>}
      {inbox?.messages?.length === 0 && <p className={styles.note}>New text messages from this number will appear here.</p>}
      {!!inbox?.messages?.length && <ul className={styles.inboxMessages} aria-label="Conversation">
        {[...inbox.messages].reverse().map((message) => <li className={styles.preview} key={message.message_id}>
          <div className={styles.inboxMessageHeading}><strong>{selected.display_name ?? "+" + selected.recipient}</strong>
            <time className={styles.note} dateTime={message.received_at}>{new Date(message.received_at).toLocaleString()}</time></div>
          <p>{message.body}</p>
          {message.auto_reply && <div className={styles.automaticReply}>
            <strong>Automatic price reply</strong>
            <p>{message.auto_reply.body}</p>
            <time className={styles.note} dateTime={message.auto_reply.accepted_at}>Accepted by WhatsApp · {new Date(message.auto_reply.accepted_at).toLocaleString()}</time>
          </div>}
        </li>)}
      </ul>}
    </> : <>
      <div className={styles.inboxTabs} aria-label="Inbox filter">
        <button type="button" aria-pressed={view === "recent"} onClick={() => loadView("recent")}>Recent chats</button>
        <button type="button" aria-pressed={view === "contacts"} onClick={() => loadView("contacts")}>Contacts</button>
      </div>
      <form className={styles.inboxSearch} onSubmit={searchList}>
        <div className={styles.fields}><label>Find by name, company or WhatsApp number
          <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} />
        </label></div>
        <div className={styles.actions}>
          {!employee && <button className={styles.secondary} type="button" onClick={() => setEditing("new")}>Add contact</button>}
          <button className={styles.secondary} type="submit">Search / Refresh</button>
        </div>
      </form>
      {!employee && view === "contacts" && <WhatsappContactImport onImported={refresh} />}
      {!page && !listError && <p className={styles.note} role="status">Loading {view === "recent" ? "chats" : "contacts"}…</p>}
      {listError && <p className={styles.error} role="alert">{listError}</p>}
      {page?.contacts.length === 0 && <p className={styles.note}>
        {query ? "No matches. Try another name or number." : view === "recent" ? "New WhatsApp texts will appear here. Saved numbers are in Contacts." : "No saved WhatsApp contacts found."}
      </p>}
      {!!page?.contacts.length && <ul className={styles.inboxMessages}>
        {page.contacts.map((contact) => <li key={contact.recipient}>
          <button className={styles.directoryEntry} type="button" onClick={() => select(contact)}>
            <strong>{contact.display_name ?? "+" + contact.recipient}</strong>
            <span>{[contact.company_name, contact.display_name ? "+" + contact.recipient : null].filter(Boolean).join(" · ")}</span>
            {contact.message_preview && <span className={styles.directoryMessage}>{contact.message_preview}</span>}
          </button>
        </li>)}
      </ul>}
      {(offset > 0 || page?.more) && <div className={styles.actions}>
        {offset > 0 && <button type="button" className={styles.secondary} onClick={() => { setOffset(offset - PAGE_SIZE); refresh(); }}>Previous</button>}
        {page?.more && <button type="button" className={styles.secondary} onClick={() => { setOffset(offset + PAGE_SIZE); refresh(); }}>Next</button>}
      </div>}
    </>}
  </section>;
}
