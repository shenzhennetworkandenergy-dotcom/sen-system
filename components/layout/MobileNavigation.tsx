"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";

import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/Button";

export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => { if (!open) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("keydown", onKeyDown); document.body.style.overflow = "hidden"; return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; }; }, [open]);

  return <div className="lg:hidden"><button type="button" className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-white/20 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(true)}>Menu</button>{open ? <div className="fixed inset-0 z-50 bg-slate-950/70" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><div id={panelId} role="dialog" aria-modal="true" aria-label="Mobile navigation" className="ml-auto flex h-full w-[min(22rem,88vw)] flex-col bg-white p-6 text-slate-950 shadow-2xl"><div className="flex items-center justify-between gap-4"><Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={130} height={100} className="h-12 w-auto object-contain"/><button type="button" className="rounded-[var(--radius-md)] border border-slate-300 px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" onClick={() => setOpen(false)}>Close</button></div><nav className="mt-8" aria-label="Mobile public navigation"><ul className="space-y-2">{siteConfig.navigation.map((item) => <li key={item.href}><a className="block rounded-[var(--radius-md)] px-3 py-3 text-base font-semibold hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={item.href} onClick={() => setOpen(false)}>{item.label}</a></li>)}</ul></nav><div className="mt-auto grid gap-3 pt-8"><Button href={siteConfig.publicCtas.requestQuote.href}>Request Quote</Button><p className="text-xs leading-5 text-slate-500">Search, customer login and tracking will be introduced in later authenticated phases.</p></div></div></div> : null}</div>;
}
