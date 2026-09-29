import Image from "next/image";
import { LeaveApplicationActions } from "@/components/hr/LeaveApplicationActions";
import { siteConfig } from "@/config/site";
import { leaveApplicationStatus, leaveApplicationStatusLabel } from "@/lib/hr/leave";

export type LeaveApplicationView = {
  id: string;
  applicationNumber: string;
  createdAt: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  contactNumber: string;
  leaveLocation?: string | null;
  additionalNote?: string | null;
  status: string;
  signedUploadedAt?: string | null;
  employee: { name: string; number: string; designation: string; department: string };
};

const companyAddress = <>House 67, Level 3, Laboratory Road, New Elephant Road<br/>Dhaka 1205, Bangladesh · +880 1805-226599 · sen.com.bd</>;

export function LeaveApplicationDocument({ data, backHref, uploadAction, showUpload = false, success, error }: {
  data: LeaveApplicationView;
  backHref: string;
  uploadAction?: (form: FormData) => void | Promise<void>;
  showUpload?: boolean;
  success?: string;
  error?: string;
}) {
  const status = leaveApplicationStatus(data.status,data.signedUploadedAt);
  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
    <style>{`
      @page { size: A4 portrait; margin: 10mm; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
        body * { visibility: hidden !important; }
        .sen-leave-application, .sen-leave-application * { visibility: visible !important; }
        .sen-leave-application { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; min-height: 0 !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .sen-leave-application section, .sen-leave-application footer { break-inside: avoid; page-break-inside: avoid; }
      }
    `}</style>
    <LeaveApplicationActions backHref={backHref}/>
    {success?<p className="mx-auto mb-4 max-w-[210mm] rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900 print:hidden">{success}</p>:null}
    {error?<p className="mx-auto mb-4 max-w-[210mm] rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900 print:hidden">{error}</p>:null}
    {showUpload && uploadAction && data.status === "pending" ? <form id="signed-copy-upload" action={uploadAction} encType="multipart/form-data" className="mx-auto mb-4 max-w-[210mm] scroll-mt-4 rounded-xl border bg-white p-4 shadow-sm print:hidden">
      <input type="hidden" name="leave_id" value={data.id}/>
      <input type="hidden" name="return_to" value={`/employee/hr/leaves/${data.id}`}/>
      <label className="block text-sm font-semibold">Upload Signed Application (PDF, JPG, JPEG or PNG; maximum 10 MB)<input type="file" name="signed_application" accept="application/pdf,image/jpeg,image/png" required className="mt-2 block w-full rounded-lg border p-2 font-normal"/></label>
      <button className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Upload Signed Application</button>
    </form>:null}
    <article className="sen-leave-application mx-auto min-h-[277mm] max-w-[210mm] overflow-hidden rounded-xl border bg-white shadow-xl">
      <header className="border-b-4 border-blue-700 bg-slate-900 px-8 py-5 text-white">
        <div className="flex items-center justify-between gap-5"><div className="flex items-center gap-4"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white p-1"><Image src={siteConfig.brandAsset.logo} alt={siteConfig.company.logoAlt} width={60} height={60} className="h-full w-full object-contain" priority/></span><div><h1 className="text-xl font-black tracking-wide">{siteConfig.company.fullName}</h1><p className="mt-1 text-[0.68rem] leading-5 text-slate-200">{companyAddress}</p></div></div><div className="text-right"><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Employee Leave</p><h2 className="mt-1 text-xl font-black">APPLICATION</h2></div></div>
      </header>
      <div className="px-8 py-6 text-[0.82rem] leading-6">
        <section className="flex justify-between gap-8 border-b pb-4"><div><p><strong>Application No:</strong> {data.applicationNumber}</p><p><strong>Status:</strong> {leaveApplicationStatusLabel(status)}</p></div><p><strong>Date:</strong> {formatDate(data.createdAt)}</p></section>
        <section className="mt-6"><p>To</p><p className="font-semibold">The Management / HR Department<br/>{siteConfig.company.fullName}</p><p>{companyAddress}</p></section>
        <p className="mt-6"><strong>Subject: Application for {data.leaveType} Leave</strong></p>
        <p className="mt-5">Dear Sir/Madam,</p>
        <p className="mt-4 text-justify">I, <strong>{data.employee.name}</strong>, Employee ID <strong>{data.employee.number}</strong>, working as <strong>{data.employee.designation}</strong> in the <strong>{data.employee.department}</strong> Department, would like to request <strong>{data.leaveType}</strong> leave from <strong>{formatDate(data.startDate)}</strong> to <strong>{formatDate(data.endDate)}</strong>, for a total of <strong>{data.totalDays} day(s)</strong>.</p>
        <section className="mt-5 rounded-lg border border-slate-300 p-4"><strong>Reason for Leave</strong><p className="mt-2 whitespace-pre-wrap">{data.reason}</p>{data.additionalNote?<><strong className="mt-3 block">Additional Note</strong><p className="whitespace-pre-wrap">{data.additionalNote}</p></>:null}<div className="mt-3 grid grid-cols-2 gap-4 text-xs"><p><strong>Contact during leave:</strong><br/>{data.contactNumber}</p><p><strong>Location during leave:</strong><br/>{data.leaveLocation||"Not provided"}</p></div></section>
        <p className="mt-5">I kindly request you to approve my leave for the period mentioned above.</p><p className="mt-3">Thank you.</p>
        <section className="mt-7"><p>Yours faithfully,</p><p className="mt-3 font-semibold">{data.employee.name}</p><p>Employee ID: {data.employee.number}<br/>Designation: {data.employee.designation}<br/>Department: {data.employee.department}</p><div className="mt-7 grid grid-cols-2 gap-12"><Signature label="Employee Signature"/><Signature label="Date"/></div></section>
        <section className="mt-8 border-t-2 border-slate-800 pt-4"><h3 className="text-center text-sm font-black uppercase tracking-[0.16em]">For Office Use Only</h3><p className="mt-4 text-center text-base">☐ Approved <span className="mx-8">☐ Rejected</span></p><div className="mt-5"><Signature label="Remarks" lines={2}/></div><div className="mt-7 grid grid-cols-3 gap-8"><Signature label="Authorized By"/><Signature label="Signature"/><Signature label="Date"/></div></section>
        <footer className="mt-8 border-t pt-3 text-center text-[0.65rem] text-slate-500">Generated securely by SEN ERP · {data.applicationNumber}</footer>
      </div>
    </article>
  </main>;
}

function Signature({ label, lines = 1 }: { label: string; lines?: number }) {
  return <div><strong>{label}:</strong>{Array.from({length:lines},(_,index)=><div key={index} className="mt-5 border-b border-slate-500"/>)}</div>;
}

function formatDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
}
