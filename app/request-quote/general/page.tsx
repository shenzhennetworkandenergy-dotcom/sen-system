import { connection } from "next/server";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { Container } from "@/components/ui/Container";
import { requireProfile } from "@/lib/auth/session";
import { requestGeneralQuotationAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function GeneralQuotationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) { await connection(); await requireProfile(["customer", "admin"]); const params = await searchParams; return <><PublicHeader/><main className="bg-slate-50 py-14"><Container className="max-w-3xl"><form action={requestGeneralQuotationAction} className="rounded-3xl border bg-white p-7 shadow-xl">{params.error ? <p className="mb-4 rounded-xl bg-red-50 p-4 text-red-900">{params.error}</p> : null}<p className="text-sm font-bold uppercase tracking-widest text-blue-700">Request a quotation</p><h1 className="mt-2 text-3xl font-bold">Tell SEN what you need</h1><p className="mt-2 text-slate-600">Describe a product, project, quantity or sourcing requirement and our team will prepare a quotation.</p><div className="mt-6 grid gap-4"><label className="font-semibold">Subject<input name="subject" required defaultValue="General quotation request" className="mt-1 w-full rounded-xl border p-3" /></label><label className="font-semibold">Quantity<input name="quantity" type="number" min="1" step="1" defaultValue="1" className="mt-1 w-full rounded-xl border p-3" /></label><label className="font-semibold">Requirement<textarea name="message" rows={7} required placeholder="Product, specification, delivery location, project or tender details" className="mt-1 w-full rounded-xl border p-3" /></label></div><button className="mt-6 rounded-xl bg-slate-950 px-6 py-3 font-bold text-white">Submit quotation request</button></form></Container></main><PublicFooter/></>; }
