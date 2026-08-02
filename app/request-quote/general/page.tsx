import { connection } from "next/server";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { Container } from "@/components/ui/Container";
import { QuotationProductPicker } from "@/components/quotations/QuotationProductPicker";
import { requireProfile } from "@/lib/auth/session";
import { requestGeneralQuotationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function GeneralQuotationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) { await connection(); await requireProfile(["customer", "admin"]); const params = await searchParams; return <div className="public-experience"><PublicHeader/><main className="bg-slate-50 py-10 sm:py-14"><Container className="max-w-3xl"><form action={requestGeneralQuotationAction} className="rounded-3xl border bg-white p-5 shadow-xl sm:p-7">{params.error ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">{params.error}</p> : null}<p className="text-sm font-bold uppercase tracking-widest text-blue-700">Request a quotation</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">Tell SEN what you need</h1><p className="mt-2 text-slate-600">Search and select a catalogue product, or leave it blank for a custom sourcing request.</p><div className="mt-6 grid gap-4"><QuotationProductPicker/><label className="font-semibold">Subject<input name="subject" required defaultValue="General quotation request" className="mt-1 w-full rounded-xl border p-3" /></label><label className="font-semibold">Quantity<input name="quantity" type="number" min="1" step="1" defaultValue="1" required className="mt-1 w-full rounded-xl border p-3" /></label><label className="font-semibold">Requirement<textarea name="message" rows={7} required placeholder="Configuration, specification, delivery location, project or tender details" className="mt-1 w-full rounded-xl border p-3" /></label></div><button className="mt-6 w-full rounded-xl bg-slate-950 px-6 py-3 font-bold text-white sm:w-auto">Submit quotation request</button></form></Container></main><PublicFooter/></div>; }
