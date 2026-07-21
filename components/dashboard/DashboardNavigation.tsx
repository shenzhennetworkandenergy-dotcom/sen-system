"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { DashboardNavigationItem } from "@/lib/navigation/dashboard";

export function DashboardNavigation({items}:{items:DashboardNavigationItem[]}){
  const [open,setOpen]=useState(false); const pathname=usePathname(); const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{document.body.style.overflow=open?"hidden":""; const close=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}}; window.addEventListener("keydown",close); return()=>{document.body.style.overflow="";window.removeEventListener("keydown",close);};},[open]);
  const groups=[...new Set(items.map((item)=>item.group))];
  const close=()=>{setOpen(false);trigger.current?.focus();};
  return <>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls="dashboard-navigation" onClick={()=>setOpen(true)} className="col-span-full min-h-11 rounded-lg border bg-[var(--surface)] px-4 py-2 text-left font-semibold lg:hidden">Open dashboard navigation</button>
    {open?<button type="button" aria-label="Close dashboard navigation" onClick={close} className="fixed inset-0 z-40 bg-black/40 lg:hidden"/>:null}
    <aside id="dashboard-navigation" className={`${open?"translate-x-0":"-translate-x-full"} fixed inset-y-0 left-0 z-50 w-[min(20rem,88vw)] overflow-y-auto border-r bg-[var(--surface)] p-4 shadow-xl transition-transform lg:sticky lg:top-4 lg:z-auto lg:h-[calc(100vh-2rem)] lg:w-auto lg:translate-x-0 lg:rounded-xl lg:border lg:shadow-none`}>
      <div className="mb-4 flex items-center justify-between lg:hidden"><strong>Dashboard menu</strong><button type="button" onClick={close} className="min-h-11 rounded border px-3">Close</button></div>
      <nav aria-label="Dashboard navigation" className="space-y-5">{groups.map((group)=><section key={group}><h2 className="mb-2 px-3 text-xs font-bold uppercase tracking-wide text-[var(--muted-text)]">{group}</h2><div className="space-y-1">{items.filter((item)=>item.group===group).map((item)=>item.route&&item.implemented?<a key={item.key} href={item.route} aria-current={pathname===item.route.split("?")[0]?"page":undefined} className={`flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${pathname===item.route.split("?")[0]?"bg-[var(--primary)] text-[var(--primary-foreground)]":"hover:bg-[var(--muted-surface)]"}`}><span>{item.label}</span></a>:<span key={item.key} aria-disabled="true" className="flex min-h-10 items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--muted-text)]"><span>{item.label}</span><span className="rounded bg-[var(--muted-surface)] px-2 py-0.5 text-[10px] font-bold uppercase">Planned</span></span>)}</div></section>)}</nav>
    </aside>
  </>;
}
