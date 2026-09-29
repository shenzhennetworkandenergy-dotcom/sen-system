import { connection } from "next/server";

import { EmployeeHrShell } from "@/components/hr/EmployeeHrShell";
import { RecruitmentTermsStep } from "@/components/hr/RecruitmentTermsStep";
import {
  getRecruitmentTermsState,
  RECRUITMENT_TERMS_TOTAL_STEPS,
  recruitmentReadingSeconds,
  recruitmentTerms,
  recruitmentTermsNotice,
  RECRUITMENT_TERMS_VERSION,
} from "@/lib/hr/recruitment";
import { routes } from "@/lib/constants/routes";
import { startRecruitmentTermsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeeRecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  await connection();
  const [state, params] = await Promise.all([getRecruitmentTermsState(), searchParams]);

  if (!state.process) {
    return (
      <EmployeeHrShell title="Recruitment" subtitle="Start the SEN Recruitment Lite terms process.">
        <section className="rounded-2xl border bg-[var(--surface)] p-6 text-center shadow-sm">
          <h2 className="text-2xl font-bold">Employee Recruitment</h2>
          <p className="mx-auto mt-2 max-w-2xl text-[var(--muted-text)]">Apply for Job starts the nine-step Terms & Conditions process. The Job Application form belongs to the next phase.</p>
          <form action={startRecruitmentTermsAction} className="mt-6">
            <button className="rounded-xl bg-[var(--primary)] px-6 py-3 font-bold text-[var(--primary-foreground)]">Apply for Job</button>
          </form>
        </section>
      </EmployeeHrShell>
    );
  }

  const acceptedSteps = new Set(
    state.acceptances.filter((item) => item.accepted_at).map((item) => item.step_number),
  );
  const completed = state.process.status === "terms_completed";
  const requested = Number(params.step);
  const reviewing = Number.isInteger(requested) && acceptedSteps.has(requested);
  const shownStep = reviewing ? requested : state.process.current_step;
  const acceptance = state.acceptances.find((item) => item.step_number === shownStep);
  const term = recruitmentTerms[shownStep - 1];

  return (
    <EmployeeHrShell title="Recruitment" subtitle="Read and accept each Terms & Conditions step. Progress saves automatically.">
      <section className="mb-5 rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
        <p className="mb-5 whitespace-pre-line rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">{recruitmentTermsNotice}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--muted-text)]">Terms version: {RECRUITMENT_TERMS_VERSION}</p>
            <h2 className="text-xl font-bold">Terms & Conditions — {acceptedSteps.size}/{RECRUITMENT_TERMS_TOTAL_STEPS} Completed</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${completed ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
            {completed ? "Completed" : `Current step ${state.process.current_step}`}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-9 gap-2" aria-label="Recruitment terms progress">
          {recruitmentTerms.map((_, index) => {
            const step = index + 1;
            const accepted = acceptedSteps.has(step);
            return accepted ? (
              <a key={step} href={`${routes.employeeHrRecruitment}?step=${step}`} className="rounded-lg bg-emerald-100 px-2 py-2 text-center text-sm font-bold text-emerald-800" aria-label={`Review accepted step ${step}`}>{step} ✓</a>
            ) : (
              <span key={step} className={`rounded-lg px-2 py-2 text-center text-sm font-bold ${step === state.process.current_step && !completed ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-500"}`}>{step}</span>
            );
          })}
        </div>
      </section>

      {completed && !reviewing ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-3xl font-black text-emerald-800">9/9 Completed</p>
          <p className="mt-2 font-semibold text-emerald-900">Terms & Conditions successfully completed.</p>
          <a href={routes.employeeHrRecruitmentApplication} className="mt-5 inline-block rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">Continue to Job Application</a>
        </section>
      ) : reviewing ? (
        <section className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
          <p className="text-sm font-bold text-emerald-700">ধাপ {shownStep} / {RECRUITMENT_TERMS_TOTAL_STEPS} — গৃহীত</p>
          <h2 className="mt-2 text-xl font-bold">{term.title}</h2>
          <p className="mt-4 whitespace-pre-line text-base leading-8 text-slate-700">{term.body}</p>
          <div className="mt-5 space-y-2">
            {term.consents.map((consent) => (
              <p key={consent} className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800">{consent} ✓</p>
            ))}
          </div>
          <a href={routes.employeeHrRecruitment} className="mt-4 inline-block rounded-xl border px-4 py-2 font-semibold">{completed ? "Completion summary" : `Resume step ${state.process.current_step}`}</a>
        </section>
      ) : acceptance ? (
        <RecruitmentTermsStep
          stepNumber={shownStep}
          title={term.title}
          body={term.body}
          consents={term.consents}
          totalSteps={RECRUITMENT_TERMS_TOTAL_STEPS}
          openedAt={acceptance.opened_at}
          readingSeconds={recruitmentReadingSeconds(shownStep)}
          serverNow={new Date().toISOString()}
        />
      ) : (
        <form action={startRecruitmentTermsAction} className="rounded-2xl border bg-[var(--surface)] p-6 text-center">
          <p className="font-semibold">Resume the saved Recruitment process.</p>
          <button className="mt-4 rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)]">Resume</button>
        </form>
      )}
    </EmployeeHrShell>
  );
}
