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
    : <><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" {...common}>{path}</svg>;
}

export function DashboardNavigation({items}:{items:DashboardNavigationItem[]}){
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
      <nav aria-label="Dashboard navigation" className="space-y-3">{groups.map((group)=><section key={group}><h2 className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200/70">{group}</h2><div className="space-y-0.5">{items.filter((item)=>item.group===group).map((item)=>{const routeHasQuery=Boolean(item.route?.includes("?"));const active=Boolean(item.route&&matchesRoute(item.route)&&(!specificMatch||routeHasQuery));return item.route&&item.implemented?<a key={item.key} href={item.route} aria-current={active?"page":undefined} className={`group flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-all ${active?"bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-blue-950/30":"text-slate-200 hover:bg-white/10 hover:text-white"}`}><NavigationIcon name={item.iconKey}/><span className="min-w-0 flex-1 truncate">{item.label}</span></a>:<span key={item.key} aria-disabled="true" className="flex min-h-8 items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-400"><NavigationIcon name={item.iconKey}/><span className="min-w-0 flex-1 truncate">{item.label}</span><span className="rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-300">Planned</span></span>})}</div></section>)}</nav>
    </aside>
  </>;
}
