import { connection } from "next/server";
import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { RecruitmentJobApplicationForm } from "@/components/hr/RecruitmentJobApplicationForm";
import { getRecruitmentJobApplication } from "@/lib/hr/recruitment-job-application-data";

export const dynamic="force-dynamic";
export default async function RecruitmentJobApplicationPage({searchParams}:{searchParams:Promise<{success?:string;error?:string;submitted?:string;validation?:string}>}) {
  await connection(); const [state,params]=await Promise.all([getRecruitmentJobApplication(),searchParams]);
  let validationErrors:Record<string,string>={};
  try { validationErrors=params.validation?JSON.parse(params.validation):{}; } catch { validationErrors={}; }
  if(state.application?.status==="SUBMITTED") return <EmployeeHrShell title="Recruitment Job Application" subtitle="Your application has been submitted."><section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><h2 className="text-2xl font-black text-emerald-800">Application Submitted Successfully</h2><dl className="mt-4 grid gap-3 md:grid-cols-3"><div><dt className="text-sm">Application Number</dt><dd className="font-bold">{state.application.application_number}</dd></div><div><dt className="text-sm">Status</dt><dd className="font-bold">SUBMITTED</dd></div><div><dt className="text-sm">Submitted On</dt><dd className="font-bold">{new Date(state.application.submitted_at).toLocaleString()}</dd></div></dl><a href="/employee/hr/recruitment/application/review" className="mt-5 inline-block rounded-xl border px-4 py-2 font-bold">View Application</a></section></EmployeeHrShell>;
  return <EmployeeHrShell title="Recruitment Job Application" subtitle="Save an incomplete draft and return at any time. Required fields are enforced only at final submission."><RecruitmentJobApplicationForm application={state.application} education={state.education} experience={state.experience} qualifications={state.qualifications} skills={state.skills} documents={state.documents} success={params.success} error={params.error} validationErrors={validationErrors}/></EmployeeHrShell>;
}
