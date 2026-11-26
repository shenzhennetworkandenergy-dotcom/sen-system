"use client";

import { useState, type FormEvent } from "react";
import type { WhatsappContact } from "@/lib/whatsapp/directory";
import styles from "./company-whatsapp.module.css";
import { whatsappRequest } from "./whatsapp-request";

type Customer = { id: string; full_name: string | null; company_name: string | null };

export function WhatsappContactEditor({ contact, onSaved, onCancel }: {
  contact?: WhatsappContact;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [phone, setPhone] = useState(contact ? "+" + contact.recipient : "");
  const [name, setName] = useState(contact?.display_name ?? "");
  const [customerId, setCustomerId] = useState(contact?.linked_customer_id ?? "");
  const [linkedName, setLinkedName] = useState(contact?.linked_customer_id ? (contact.display_name ?? "ERP customer") : "");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function find() {
    setBusy(true);
    setError("");
    try {
      const data = await whatsappRequest<{ customers: Customer[] }>("contacts", { mode: "customers", query });
      setCustomers(data.customers);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await whatsappRequest("contacts", { mode: "save", recipient: phone, name, customerId: customerId || null });
      onSaved();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <form className={styles.preview} onSubmit={save}>
    <fieldset className={styles.fields} disabled={busy}>
      <label>WhatsApp number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} readOnly={Boolean(contact)} maxLength={40} required /></label>
      <label>Contact name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required /></label>
      <label>Link an ERP customer (optional)<input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} /></label>
      <div className={styles.actions}><button className={styles.secondary} type="button" disabled={query.trim().length < 2} onClick={find}>Find customer</button></div>
      {customers?.length === 0 && <p className={styles.note}>No active ERP customer matched.</p>}
      {customers?.map((customer) => {
        const title = [customer.full_name, customer.company_name].filter(Boolean).join(" · ");
        return <button key={customer.id} className={styles.directoryEntry} type="button" onClick={() => {
          setCustomerId(customer.id);
          setLinkedName(title);
          setName((current) => current.trim() ? current : (customer.full_name ?? customer.company_name ?? ""));
          setCustomers(null);
        }}>{title || "ERP customer"}</button>;
      })}
      {customerId && <div className={styles.actions}><span className={styles.note}>Linked to {linkedName}.</span><button type="button" className={styles.secondary} onClick={() => {
        setCustomerId("");
        setLinkedName("");
      }}>Clear link</button></div>}
    </fieldset>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      <button className={styles.secondary} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Working…" : "Save contact"}</button>
    </div>
  </form>;
}
