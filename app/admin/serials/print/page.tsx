/* eslint-disable @next/next/no-img-element, @next/next/no-html-link-for-pages */
import Image from "next/image";
import { PrintButton } from "@/components/inventory/PrintButton";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { requirePermission } from "@/lib/auth/permissions";
import { createSerialLabelAssets } from "@/lib/inventory/labels";
import {
  isUuid,
  parseSerialPrintSelection,
  serialPrintQuery,
  type SerialPrintSelection,
} from "@/lib/inventory/label-sizes";
import {
  createSerialLabelLayout,
  selectSingleSerialForLabelPrinter,
} from "@/lib/inventory/serial-label-layout";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSerialLabelSizeAction, deleteSerialLabelSizeAction } from "./actions";

export const dynamic = "force-dynamic";

type PrintParams = {
  ids?: string;
  batch?: string;
  product?: string;
  size?: string;
  success?: string;
  error?: string;
};

type LabelSize = { id: string; name: string; width_mm: number; height_mm: number };

function SelectionFields({ selection }: { selection: SerialPrintSelection }) {
  if (selection.kind === "ids") return <input type="hidden" name="ids" value={selection.ids.join(",")} />;
  return <input type="hidden" name={selection.kind} value={selection.id} />;
}

function Notice({ params }: { params: PrintParams }) {
  if (!params.success && !params.error) return null;
  return <p className={`mb-5 rounded-xl border p-4 ${params.error ? "border-red-300 bg-red-50 text-red-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>{params.error ?? params.success}</p>;
}

export default async function SerialPrintPage({ searchParams }: { searchParams: Promise<PrintParams> }) {
  const { profile } = await requirePermission("serials.print");
  const params = await searchParams;
  const selection = parseSerialPrintSelection(params);
  if (!selection) return <main className="min-h-screen bg-slate-50 p-8 text-slate-950"><div className="mx-auto max-w-3xl rounded-2xl border bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold">No serials selected</h1><p className="mt-2 text-slate-600">Choose one or more SEN serials before generating labels.</p><a href="/admin/serials" className="mt-5 inline-block rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">Return to Serial Tracking</a></div></main>;

  const db = createSupabaseAdminClient();
  const { data: sizeRows, error: sizeError } = await db.from("serial_label_sizes").select("id,name,width_mm,height_mm").order("width_mm").order("height_mm").order("name");
  if (sizeError) throw new Error("Unable to load serial label sizes.");
  const sizes = (sizeRows ?? []) as LabelSize[];
  const selectedSize = isUuid(params.size) ? sizes.find((size) => size.id === params.size) : undefined;

  if (!selectedSize) {
    return <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-blue-50 p-5 text-slate-950 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-blue-700">SEN serial labels</p><h1 className="mt-1 text-3xl font-bold">Choose label size</h1><p className="mt-2 text-slate-600">Select a saved size before the SEN label is generated.</p></div><a href="/admin/serials" className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold">Back to serials</a></div>
        <Notice params={{ ...params, error: params.error ?? (params.size ? "That label size is unavailable. Choose another size." : undefined) }} />
        {sizes.length ? <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Saved label sizes">{sizes.map((size) => <article key={size.id} className="flex min-h-44 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex-1"><h2 className="text-lg font-bold">{size.name}</h2><p className="mt-1 text-slate-600">{size.width_mm} × {size.height_mm} mm</p><div className="mt-4 flex h-16 items-center justify-center rounded-lg bg-slate-100"><span className="border-2 border-dashed border-blue-400 bg-white" style={{ width: `${Math.min(Number(size.width_mm), 120)}px`, height: `${Math.min(Number(size.height_mm), 55)}px` }} /></div></div><div className="mt-4 flex items-center gap-2"><a href={`?${serialPrintQuery(selection, size.id)}`} className="flex-1 rounded-xl bg-blue-700 px-4 py-2.5 text-center font-semibold text-white">Use this size</a>{profile.role === "admin" ? <form action={deleteSerialLabelSizeAction}><SelectionFields selection={selection}/><input type="hidden" name="size_id" value={size.id}/><ConfirmSubmitButton confirmation={`Delete label size ${size.name}?`} className="rounded-xl border border-red-300 px-3 py-2.5 font-semibold text-red-700">Delete</ConfirmSubmitButton></form> : null}</div></article>)}</section> : <p className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">No label sizes are available. {profile.role === "admin" ? "Add the first size below." : "Ask an administrator to add a label size."}</p>}
        {profile.role === "admin" ? <section className="mt-6 rounded-2xl border border-blue-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">Add label size</h2><p className="mt-1 text-sm text-slate-600">Save dimensions in millimetres. The size will appear for every authorized label printer.</p><form action={createSerialLabelSizeAction} className="mt-4 grid gap-4 md:grid-cols-[1fr_11rem_11rem_auto]"><SelectionFields selection={selection}/><label className="text-sm font-semibold">Size name<input name="name" required minLength={2} maxLength={80} placeholder="Example: Shelf 70 x 35 mm" className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Width (mm)<input name="width_mm" type="number" min="10" max="300" step="0.01" required className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-sm font-semibold">Height (mm)<input name="height_mm" type="number" min="10" max="300" step="0.01" required className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><button className="self-end rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">Add size</button></form></section> : null}
      </div>
    </main>;
  }

  let query = db.from("serial_numbers").select("id,sen_serial,manufacturer_serial,status,condition,product_id,products(name,model_number,brands(name))").not("sen_serial", "is", null).limit(1);
  if (selection.kind === "batch") query = query.eq("generation_batch_id", selection.id);
  else if (selection.kind === "product") query = query.eq("product_id", selection.id);
  else query = query.in("id", selection.ids);
  const { data, error } = await query.order("created_at");
  if (error) throw new Error("Unable to load printable serials.");
  const printableUnits = selectSingleSerialForLabelPrinter(data ?? []);
  const labels = await Promise.all(printableUnits.map(async (unit) => ({ ...unit, assets: await createSerialLabelAssets(unit.sen_serial!) })));
  const labelLayout = createSerialLabelLayout(Number(selectedSize.width_mm), Number(selectedSize.height_mm));
  const selectionQuery = serialPrintQuery(selection);

  return <main className="label-print min-h-screen bg-slate-100 p-6 text-black">
    <style>{`@media print { @page { size: ${selectedSize.width_mm}mm ${selectedSize.height_mm}mm; margin: 0; } }`}</style>
    <div className="print:hidden mx-auto mb-6 flex max-w-5xl flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm"><a href={`/admin/serials/print?${selectionQuery}`} className="rounded-xl border px-4 py-2.5 font-semibold">Change size</a>{labels.length ? <PrintButton/> : null}<span className="text-sm text-slate-600">{labels.length} label · {selectedSize.name} · {selectedSize.width_mm} × {selectedSize.height_mm} mm</span></div>
    {labels.length ? <div className="label-grid mx-auto" style={{ gridTemplateColumns: `${selectedSize.width_mm}mm` }}>{labels.map((unit) => {
      const product = unit.products as unknown as { name: string; model_number: string | null; brands: { name: string } | null };
      return <article key={unit.id} className="serial-label relative break-inside-avoid border border-black bg-white" style={{ width: `${selectedSize.width_mm}mm`, height: `${selectedSize.height_mm}mm` }}>
        <div className="serial-label-canvas" style={{ width: `${labelLayout.canvasWidthMm}mm`, height: `${labelLayout.canvasHeightMm}mm`, left: `${labelLayout.offsetXmm}mm`, top: `${labelLayout.offsetYmm}mm`, transform: `scale(${labelLayout.scale})` }}>
          <div className="serial-label-header"><Image src="/brand/sen-official-logo.png" alt="SEN" width={50} height={50} className="serial-label-logo"/><strong className="serial-label-brand">{product?.brands?.name ?? "SEN"}</strong></div>
          <h2 className="serial-label-product">{product?.name}</h2>
          <p className="serial-label-model">Model: {product?.model_number ?? "—"}</p>
          <div className="serial-label-barcode" dangerouslySetInnerHTML={{ __html: unit.assets.barcodeSvg }}/>
          <p className="serial-label-number">{unit.sen_serial}</p>
          <div className="serial-label-footer"><img src={unit.assets.qrDataUrl} alt={`QR for ${unit.sen_serial}`} className="serial-label-qr"/><div className="serial-label-meta"><p>{unit.manufacturer_serial ? `MFR: ${unit.manufacturer_serial}` : "Manufacturer serial not provided"}</p><p>{unit.condition} · {unit.status}</p></div></div>
        </div>
      </article>;
    })}</div> : <div className="print:hidden mx-auto max-w-3xl rounded-2xl border bg-white p-8 text-center"><h2 className="text-xl font-bold">No printable serials found</h2><p className="mt-2 text-slate-600">The selected records do not contain active SEN serial values.</p></div>}
  </main>;
}
