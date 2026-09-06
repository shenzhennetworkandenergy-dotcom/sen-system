import { connection } from "next/server";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requirePermission } from "@/lib/auth/permissions";
import { cargoLabel, getCargoPackageLabel } from "@/lib/cargo-tracking/data";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

export default async function CargoPackageLabelPage({ params }: { params: Promise<{ jobId: string; packageId: string }> }) {
  await connection();
  await requirePermission("cargo.view");
  const { jobId, packageId } = await params;
  const data = await getCargoPackageLabel(jobId, packageId);
  if (!data) notFound();
  const { job, cargoPackage } = data;
  const customer = job.customer as { full_name: string | null; company_name: string | null; email: string } | null;
  const qr = await QRCode.toDataURL(cargoPackage.package_identifier, { errorCorrectionLevel: "M", margin: 1, width: 360 });

  return <main className="min-h-screen bg-slate-100 p-6 print:min-h-0 print:bg-white print:p-0">
    <style>{`@page { size: 4in 3in; margin: 0; } @media print { html, body { width: 4in; height: 3in; margin: 0; } }`}</style>
    <div className="mx-auto mb-4 flex w-[4in] justify-end print:hidden"><PrintButton /></div>
    <article className="mx-auto flex h-[3in] w-[4in] flex-col overflow-hidden border-2 border-[#102a56] bg-white text-[#102a56] print:border-2">
      <header className="flex items-center justify-between border-b-2 border-[#1d75bd] px-4 py-3">
        <img src="/brand/sen-official-logo.png" alt="SEN" className="h-12 w-auto object-contain" />
        <div className="text-right"><h1 className="text-lg font-black tracking-wide">CARGO PACKAGE</h1><p className="text-xs font-bold">Warehouse Identification Label</p></div>
      </header>
      <div className="grid flex-1 grid-cols-[1fr_108px] gap-3 px-4 py-3">
        <dl className="grid content-start grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-[10px] leading-tight">
          <dt className="font-bold">Cargo ID</dt><dd className="font-black">{job.internal_cargo_id}</dd>
          <dt className="font-bold">Package ID</dt><dd className="font-black">{cargoPackage.package_identifier}</dd>
          <dt className="font-bold">Tracking</dt><dd>{job.courier_tracking_number}</dd>
          <dt className="font-bold">Customer</dt><dd>{customer?.full_name || customer?.company_name || customer?.email}</dd>
          <dt className="font-bold">Method</dt><dd>{cargoLabel(job.shipping_method)}</dd>
          <dt className="font-bold">Carrier</dt><dd>{job.carrier?.name || "—"}</dd>
          <dt className="font-bold">Contents</dt><dd>{cargoPackage.description}</dd>
          <dt className="font-bold">Quantity</dt><dd>{cargoPackage.quantity} {cargoPackage.unit}</dd>
          <dt className="font-bold">Weight</dt><dd>{cargoPackage.weight ?? "—"} kg</dd>
          <dt className="font-bold">Location</dt><dd>{cargoPackage.warehouseLocation ? `${cargoPackage.warehouseLocation.code} ${cargoPackage.warehouseLocation.name}` : "Not assigned"}</dd>
        </dl>
        <div className="flex flex-col items-center justify-center"><img src={qr} alt={`QR ${cargoPackage.package_identifier}`} className="h-[104px] w-[104px]" /><p className="mt-1 break-all text-center text-[9px] font-black">{cargoPackage.package_identifier}</p></div>
      </div>
    </article>
  </main>;
}
