"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { DashboardNavigationItem } from "@/lib/navigation/dashboard";

function NavigationIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const path = name === "dashboard" ? <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>
    : ["users", "employees", "hr"].includes(name) ? <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M16 4.5a3 3 0 0 1 0 6M16.5 14c2.5.5 3.8 2.5 4 5.5"/></>
    : ["activity", "reports"].includes(name) ? <><path d="M4 19V9M10 19V4M16 19v-7M22 19H2"/></>
    : ["products", "inventory"].includes(name) ? <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></>
    : ["warehouses", "purchasing", "shipments"].includes(name) ? <><path d="M3 21V8l9-5 9 5v13M7 21v-8h10v8M3 10h18"/></>
    : name === "serials" ? <><path d="M5 4v16M9 4v16M13 4v16M18 4v16M21 4v16"/><path d="M3 8h20M3 16h20"/></>
    : name === "profile" ? <><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7"/></>
    : name === "archive" ? <><path d="M4 7h16v14H4zM3 3h18v4H3zM9 11h6"/></>
    : name === "permissions" ? <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2-2 2 1 1-2 2-1-1-3 3"/></>
    : name === "crm" ? <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M7 8h10M7 12h7"/></>
    : ["orders", "quotations"].includes(name) ? <><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></>
    : name === "sales" ? <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m3 7 6-4 5 4 7-5"/></>
    : name === "locations" ? <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>
    : name === "statuses" ? <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>
    : name === "suppliers" ? <><path d="M3 21V7l6-4 6 4v14M15 10h6v11M7 10h4M7 14h4"/></>
    : name === "accounting" ? <><path d="M4 6h16M4 18h16M7 3v18M17 3v18"/><path d="M10 10h4M10 14h4"/></>
    : <><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" {...common}>{path}</svg>;
}

export function DashboardNavigation({items,workCounts={}}:{items:DashboardNavigationItem[];workCounts?:Record<string,number>}){
  const [open,setOpen]=useState(false); const pathname=usePathname(); const searchParams=useSearchParams(); const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{document.body.style.overflow=open?"hidden":""; const close=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);trigger.current?.focus();}}; window.addEventListener("keydown",close); return()=>{document.body.style.overflow="";window.removeEventListener("keydown",close);};},[open]);
  const groups=[...new Set(items.map((item)=>item.group))];
  const matchesRoute=(route:string)=>{const [path,query=""]=route.split("?");if(pathname!==path)return false;const expected=new URLSearchParams(query);return [...expected].every(([key,value])=>searchParams.get(key)===value);};
  const specificMatch=items.some((item)=>Boolean(item.route?.includes("?")&&matchesRoute(item.route)));
  const close=()=>{setOpen(false);trigger.current?.focus();};
  return <>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls="dashboard-navigation" onClick={()=>setOpen(true)} className="col-span-full flex min-h-10 items-center justify-between rounded-lg border border-slate-700 bg-[#0b1730] px-3 py-2 text-sm font-semibold text-white shadow-lg lg:hidden"><span>Dashboard menu</span><span aria-hidden="true">☰</span></button>
    {open?<button type="button" aria-label="Close dashboard navigation" onClick={close} className="fixed inset-0 z-40 bg-black/45 lg:hidden"/>:null}
    <aside id="dashboard-navigation" className={`${open?"translate-x-0":"-translate-x-full"} sen-dashboard-sidebar fixed inset-y-0 left-0 z-50 w-[min(18rem,88vw)] overflow-y-auto border-r border-slate-700 bg-[#0b1730] p-3 text-slate-100 shadow-2xl transition-transform lg:sticky lg:top-[4.25rem] lg:z-auto lg:h-[calc(100vh-5.25rem)] lg:w-auto lg:translate-x-0 lg:rounded-xl lg:border`}>
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2 lg:hidden"><strong>Dashboard menu</strong><button type="button" onClick={close} className="min-h-9 rounded border border-white/20 bg-white/5 px-3 text-sm">Close</button></div>
      <nav aria-label="Dashboard navigation" className="space-y-3">{groups.map((group)=><section key={group}><h2 className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200/70">{group}</h2><div className="space-y-0.5">{items.filter((item)=>item.group===group).map((item)=>{const routeHasQuery=Boolean(item.route?.includes("?"));const active=Boolean(item.route&&matchesRoute(item.route)&&(!specificMatch||routeHasQuery));const count=workCounts[item.key]??0;return item.route&&item.implemented?<a key={item.key} href={item.route} aria-current={active?"page":undefined} className={`group flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-all ${active?"bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-blue-950/30":count>0?"bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/40 hover:bg-amber-400/25":"text-slate-200 hover:bg-white/10 hover:text-white"}`}><NavigationIcon name={item.iconKey}/><span className="min-w-0 flex-1 truncate">{item.label}</span>{count>0?<span className="grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow" aria-label={`${count} items need attention`}>{count}</span>:null}</a>:<span key={item.key} aria-disabled="true" className="flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-400"><NavigationIcon name={item.iconKey}/><span className="min-w-0 flex-1 truncate">{item.label}</span><span className="rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-300">Planned</span></span>})}</div></section>)}</nav>
    </aside>
  </>;
}
