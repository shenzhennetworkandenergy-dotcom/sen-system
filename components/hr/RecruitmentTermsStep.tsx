"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  acceptRecruitmentTermAction,
  type RecruitmentActionState,
} from "@/app/employee/hr/recruitment/actions";

function clock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function RecruitmentTermsStep({
  stepNumber,
  title,
  body,
  consents,
  totalSteps,
  openedAt,
  readingSeconds,
  serverNow,
}: {
  stepNumber: number;
  title: string;
  body: string;
  consents: readonly string[];
  totalSteps: number;
  openedAt: string;
  readingSeconds: number;
  serverNow: string;
}) {
  const serverOffset = useMemo(
    () => new Date(serverNow).getTime() - Date.now(),
    [serverNow],
  );
  const deadline = useMemo(
    () => new Date(openedAt).getTime() + readingSeconds * 1000,
    [openedAt, readingSeconds],
  );
  const remainingNow = () =>
    Math.max(0, Math.ceil((deadline - (Date.now() + serverOffset)) / 1000));
  const [remaining, setRemaining] = useState(remainingNow);
  const [consented, setConsented] = useState(() => consents.map(() => false));
  const [state, action, pending] = useActionState<RecruitmentActionState, FormData>(
    acceptRecruitmentTermAction,
    { error: "" },
  );

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(remainingNow()), 250);
    return () => window.clearInterval(timer);
  }, [deadline, serverOffset]);

  const timerComplete = remaining === 0;
  const allConsented = consented.every(Boolean);

  return (
    <section className="rounded-2xl border bg-[var(--surface)] p-5 shadow-sm">
      <p className="text-sm font-bold text-blue-700">ধাপ {stepNumber} / {totalSteps}</p>
      <h2 className="mt-2 text-xl font-bold">{title}</h2>
      <p className="mt-4 whitespace-pre-line text-base leading-8 text-slate-700">{body}</p>
      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="font-semibold text-blue-950" aria-live="polite">
          {timerComplete
            ? "পড়ার ন্যূনতম সময় সম্পন্ন হয়েছে"
            : `পড়ার জন্য অবশিষ্ট সময়: ${clock(remaining)}`}
        </p>
      </div>
      <form action={action} className="mt-5 space-y-4">
        <input type="hidden" name="step" value={stepNumber} />
        {consents.map((consent, index) => (
          <label key={consent} className={`flex items-start gap-3 rounded-xl border p-4 ${timerComplete ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
            <input
              name={`consent_${index}`}
              value="yes"
              type="checkbox"
              disabled={!timerComplete || pending}
              checked={consented[index]}
              onChange={(event) => setConsented((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span className="font-semibold">{consent}</span>
          </label>
        ))}
        {state.error ? <p className="text-sm font-semibold text-red-700" aria-live="polite">{state.error}</p> : null}
        <button
          disabled={!timerComplete || !allConsented || pending}
          className="w-full rounded-xl bg-[var(--primary)] px-5 py-3 font-bold text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "সংরক্ষণ হচ্ছে…" : stepNumber === totalSteps ? "সম্মতি সংরক্ষণ করে সম্পন্ন করুন" : "সম্মতি সংরক্ষণ করে পরবর্তী ধাপে যান"}
        </button>
      </form>
    </section>
  );
}
