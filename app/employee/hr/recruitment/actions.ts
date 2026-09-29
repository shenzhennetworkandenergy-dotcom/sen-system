"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { routes } from "@/lib/constants/routes";
import {
  RECRUITMENT_TERMS_VERSION,
  RECRUITMENT_TERMS_TOTAL_STEPS,
  recruitmentReadingSeconds,
  recruitmentTerms,
} from "@/lib/hr/recruitment";
import { requireEmployeeRecruitmentAccess } from "@/lib/hr/recruitment-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RecruitmentActionState = { error: string };

export async function startRecruitmentTermsAction() {
  const context = await requireEmployeeRecruitmentAccess();
  const db = createSupabaseAdminClient();
  const existing = await db
    .from("hr_recruitment_processes")
    .select("id,current_step")
    .eq("profile_id", context.profile.id)
    .eq("terms_version", RECRUITMENT_TERMS_VERSION)
    .maybeSingle();
  if (existing.error) throw new Error("Unable to start Recruitment.");

  let process = existing.data as { id: string; current_step: number } | null;
  if (!process) {
    const created = await db
      .from("hr_recruitment_processes")
      .insert({
        profile_id: context.profile.id,
        terms_version: RECRUITMENT_TERMS_VERSION,
        status: "terms_in_progress",
        current_step: 1,
      })
      .select("id,current_step")
      .single();
    if (created.error) {
      const raced = await db
        .from("hr_recruitment_processes")
        .select("id,current_step")
        .eq("profile_id", context.profile.id)
        .eq("terms_version", RECRUITMENT_TERMS_VERSION)
        .maybeSingle();
      if (raced.error || !raced.data) throw new Error("Unable to start Recruitment.");
      process = raced.data as { id: string; current_step: number };
    } else {
      process = created.data as { id: string; current_step: number };
    }
  }

  const opened = await db.from("hr_recruitment_term_acceptances").upsert(
    {
      process_id: process.id,
      profile_id: context.profile.id,
      terms_version: RECRUITMENT_TERMS_VERSION,
      step_number: process.current_step,
    },
    { onConflict: "process_id,step_number", ignoreDuplicates: true },
  );
  if (opened.error) throw new Error("Unable to open Recruitment terms.");
  revalidatePath(routes.employeeHrRecruitment);
  redirect(routes.employeeHrRecruitment);
}

export async function acceptRecruitmentTermAction(
  _previous: RecruitmentActionState,
  formData: FormData,
): Promise<RecruitmentActionState> {
  const context = await requireEmployeeRecruitmentAccess();
  const requestedStep = Number(formData.get("step"));
  if (!Number.isInteger(requestedStep) || requestedStep < 1 || requestedStep > RECRUITMENT_TERMS_TOTAL_STEPS) {
    return { error: "রিক্রুটমেন্ট ধাপটি সঠিক নয়।" };
  }
  const term = recruitmentTerms[requestedStep - 1];
  if (!term.consents.every((_, index) => formData.get(`consent_${index}`) === "yes")) {
    return { error: "প্রতিটি সম্মতি নির্বাচন করুন।" };
  }

  const db = createSupabaseAdminClient();
  const processResult = await db
    .from("hr_recruitment_processes")
    .select("id,current_step,status")
    .eq("profile_id", context.profile.id)
    .eq("terms_version", RECRUITMENT_TERMS_VERSION)
    .single();
  const process = processResult.data as { id: string; current_step: number; status: string } | null;
  if (processResult.error || !process) return { error: "রিক্রুটমেন্ট প্রক্রিয়াটি পাওয়া যায়নি।" };
  if (process.status !== "terms_in_progress" || process.current_step !== requestedStep) {
    return { error: "শুধু বর্তমান অসম্পূর্ণ ধাপটি গ্রহণ করা যাবে।" };
  }

  const openedResult = await db
    .from("hr_recruitment_term_acceptances")
    .select("id,opened_at,accepted_at")
    .eq("process_id", process.id)
    .eq("profile_id", context.profile.id)
    .eq("step_number", requestedStep)
    .single();
  const opened = openedResult.data as { id: string; opened_at: string; accepted_at: string | null } | null;
  if (openedResult.error || !opened) return { error: "ধাপের পড়ার সময় শুরু হয়নি।" };
  if (opened.accepted_at) redirect(routes.employeeHrRecruitment);

  const earliestAcceptance = new Date(opened.opened_at).getTime() + recruitmentReadingSeconds(requestedStep) * 1000;
  if (Date.now() < earliestAcceptance) return { error: "ন্যূনতম পড়ার সময় এখনো শেষ হয়নি।" };

  const accepted = await db
    .from("hr_recruitment_term_acceptances")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", opened.id)
    .eq("profile_id", context.profile.id)
    .is("accepted_at", null)
    .select("id")
    .maybeSingle();
  if (accepted.error || !accepted.data) return { error: "সম্মতি সংরক্ষণ করা যায়নি।" };

  if (requestedStep === RECRUITMENT_TERMS_TOTAL_STEPS) {
    const completed = await db
      .from("hr_recruitment_processes")
      .update({ status: "terms_completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", process.id)
      .eq("profile_id", context.profile.id)
      .eq("current_step", RECRUITMENT_TERMS_TOTAL_STEPS);
    if (completed.error) return { error: "সমাপ্তির অবস্থা সংরক্ষণ করা যায়নি।" };
  } else {
    const nextStep = requestedStep + 1;
    const advanced = await db
      .from("hr_recruitment_processes")
      .update({ current_step: nextStep, updated_at: new Date().toISOString() })
      .eq("id", process.id)
      .eq("profile_id", context.profile.id)
      .eq("current_step", requestedStep);
    if (advanced.error) return { error: "পরবর্তী ধাপ খোলা যায়নি।" };
    const nextOpened = await db.from("hr_recruitment_term_acceptances").upsert(
      {
        process_id: process.id,
        profile_id: context.profile.id,
        terms_version: RECRUITMENT_TERMS_VERSION,
        step_number: nextStep,
      },
      { onConflict: "process_id,step_number", ignoreDuplicates: true },
    );
    if (nextOpened.error) return { error: "পরবর্তী ধাপ খোলা যায়নি।" };
  }

  revalidatePath(routes.employeeHrRecruitment);
  redirect(routes.employeeHrRecruitment);
}
