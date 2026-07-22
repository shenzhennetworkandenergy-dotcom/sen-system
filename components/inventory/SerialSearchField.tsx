"use client";

import { useEffect, useState } from "react";

type Result = { id: string; sen_serial: string; manufacturer_serial: string | null; status: string; condition: string };

export function SerialSearchField({ initialValue = "" }: { initialValue?: string }) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/admin/serial-search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const payload = await response.json() as { results?: Result[] };
        setResults(response.ok ? payload.results ?? [] : []);
      } catch (error) { if ((error as Error).name !== "AbortError") setResults([]); }
      finally { setBusy(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  const suggestions = query.trim().length >= 2 ? results : [];
  return <div className="relative flex-1"><label className="sr-only" htmlFor="serial-search">SEN or manufacturer serial</label><input id="serial-search" autoFocus name="q" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" placeholder="SEN or manufacturer serial" className="min-h-12 w-full rounded border p-3" aria-describedby="serial-search-help"/><p id="serial-search-help" className="mt-1 text-xs text-[var(--muted-text)]">Type two characters to search. Keyboard scanners can enter a code and submit.</p>{busy?<span className="absolute right-3 top-3 text-xs">Searching…</span>:null}{suggestions.length?<ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border bg-[var(--surface)] p-1 shadow-xl" aria-label="Serial suggestions">{suggestions.map((item)=><li key={item.id}><a href={`/admin/serials/${item.id}`} className="block rounded p-3 hover:bg-[var(--muted-surface)]"><strong className="block font-mono text-sm">{item.sen_serial}</strong><span className="text-xs text-[var(--muted-text)]">{item.manufacturer_serial??"Manufacturer serial not provided"} · {item.status} · {item.condition}</span></a></li>)}</ul>:null}</div>;
}
