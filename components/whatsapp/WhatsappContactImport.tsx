"use client";

import { useState, type ChangeEvent } from "react";
import { parseWhatsappVCard } from "@/lib/whatsapp/vcard";
import styles from "./company-whatsapp.module.css";
import { whatsappRequest } from "./whatsapp-request";

export function WhatsappContactImport({ onImported }: { onImported: () => void }) {
  const [preview, setPreview] = useState<ReturnType<typeof parseWhatsappVCard> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPreview(null);
    setError("");
    setSummary("");
    if (file.size > 2 * 1024 * 1024) {
      setError("Choose a vCard file of up to 2 MB.");
      return;
    }
    try {
      const data = parseWhatsappVCard(await file.text());
      setPreview(data);
    } catch { setError("The vCard file could not be read."); }
  }

  async function save() {
    if (!preview?.contacts.length || busy) return;
    setBusy(true);
    setError("");
    let added = 0;
    let offset = 0;
    try {
      for (; offset < preview.contacts.length; offset += 40) {
        const result = await whatsappRequest<{ added: number }>("contacts", {
          mode: "import", contacts: preview.contacts.slice(offset, offset + 40),
        });
        added += result.added;
      }
      setSummary(added + " contacts added. " + (preview.contacts.length - added) + " already saved.");
      setPreview(null);
    } catch (failure) {
      setSummary(added + " contacts added so far.");
      setPreview({ ...preview, contacts: preview.contacts.slice(offset) });
      setError((failure as Error).message);
    } finally {
      setBusy(false);
      onImported();
    }
  }

  return <details className={styles.preview}>
    <summary>Import phone contacts (.vcf)</summary>
    <p className={styles.note}>Choose a contacts export containing the SEN customers you want to save.</p>
    <div className={styles.fields}><label>vCard file<input type="file" accept=".vcf,.vcard,text/vcard" disabled={busy} onChange={chooseFile} /></label></div>
    {preview && <>
      <p>{preview.contacts.length} ready · {preview.conflicting} conflicting numbers · {preview.skipped} entries skipped</p>
      <ul className={styles.importPreview} aria-label="Contacts to be imported">{preview.contacts.map((contact) => <li key={contact.recipient}>{contact.name} · +{contact.recipient}</li>)}</ul>
      <div className={styles.actions}><button className={styles.primary} type="button" disabled={busy || !preview.contacts.length} onClick={save}>{busy ? "Importing…" : "Import these contacts"}</button></div>
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {summary && <p className={styles.note} role="status">{summary}</p>}
  </details>;
}
