"use client";

import { useState } from "react";
import { requestPasswordHelpAction } from "@/app/forgot-password/actions";

export function PasswordHelpChat({ success, error }: { success?: string; error?: string }) {
  const [open, setOpen] = useState(Boolean(success || error));
  return <div className="mt-8">
    <button type="button" onClick={() => setOpen(true)} className="w-full rounded-full bg-blue-600 px-5 py-3 font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-500">Chat with an administrator</button>
    {open ? <div className="fixed inset-0 z-[1200] grid place-items-end bg-slate-950/35 p-4 sm:place-items-center" role="dialog" aria-modal="true" aria-label="Password recovery chat">
      <section className="sen-password-help-panel w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-gradient-to-r from-blue-700 to-cyan-600 px-5 py-4 text-white"><div><strong className="block">SEN account help</strong><span className="text-xs text-blue-50">Send a private password recovery request</span></div><button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/15 px-3 py-1 text-xl" aria-label="Close">×</button></header>
        <form action={requestPasswordHelpAction} className="sen-password-help-form grid gap-4 p-5">
          {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p> : null}
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
          <label className="text-sm font-semibold">Account email<input name="email" type="email" required className="mt-1 w-full rounded-xl border p-3"/></label>
          <label className="text-sm font-semibold">How can we help?<textarea name="message" minLength={5} maxLength={2000} required rows={4} defaultValue="I forgot my password and need help recovering my account." className="mt-1 w-full rounded-xl border p-3"/></label>
          <p className="text-xs text-slate-500">Do not send your old password. An administrator can set a temporary password from the protected Users section.</p>
          <button className="rounded-full bg-blue-600 px-5 py-3 font-bold text-white">Send request</button>
        </form>
      </section>
    </div> : null}
  </div>;
}
