"use client";

import { useState, type FormEvent } from "react";
import { whatsappPriceText } from "@/lib/whatsapp/price-inquiry";
import styles from "./company-whatsapp.module.css";
import { whatsappRequest } from "./whatsapp-request";

type PriceProduct = { id: string; name: string; sku: string; slug: string; price: number };

export function WhatsappPriceReply({ onSelect }: { onSelect: (text: string) => void }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<PriceProduct[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setProducts(null);
    try {
      const data = await whatsappRequest<{ products: PriceProduct[] }>("products", { query });
      setProducts(data.products);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <details className={styles.preview}>
    <summary>Find a catalogue price</summary>
    <form className={styles.inboxSearch} onSubmit={search}>
      <div className={styles.fields}><label>Product, SKU or model
        <input placeholder="16TB HDD" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} required />
      </label></div>
      <div className={styles.actions}><button className={styles.secondary} disabled={busy} type="submit">{busy ? "Searching…" : "Find price"}</button></div>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {products?.length === 0 && <p className={styles.note}>No matching catalogue price. Try the exact model or SKU.</p>}
    {products?.map((product) => <button key={product.id} type="button" className={styles.directoryEntry} onClick={() => {
      onSelect(whatsappPriceText(product, product.price, /[ঀ-৿]/u.test(query)));
    }}><strong>{product.name}</strong><span>{product.sku} · BDT {product.price.toLocaleString("en-BD", { minimumFractionDigits: 2 })}</span></button>)}
  </details>;
}
