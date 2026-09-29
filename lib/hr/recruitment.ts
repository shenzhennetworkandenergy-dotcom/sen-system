import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireEmployeeRecruitmentAccess } from "@/lib/hr/recruitment-access";
export {
  RECRUITMENT_TERMS_TOTAL_STEPS,
  RECRUITMENT_TERMS_VERSION,
  recruitmentReadingSeconds,
  recruitmentTerms,
  recruitmentTermsNotice,
} from "@/lib/hr/recruitment-terms";
import { RECRUITMENT_TERMS_VERSION } from "@/lib/hr/recruitment-terms";

type RecruitmentProcess = {
  id: string;
  profile_id: string;
  terms_version: string;
  status: "terms_in_progress" | "terms_completed";
  current_step: number;
  started_at: string;
  completed_at: string | null;
};

type RecruitmentAcceptance = {
  id: string;
  process_id: string;
  profile_id: string;
  terms_version: string;
  step_number: number;
  opened_at: string;
  accepted_at: string | null;
};

export async function getRecruitmentTermsState() {
  const context = await requireEmployeeRecruitmentAccess();
  const db = createSupabaseAdminClient();
  const processResult = await db
    .from("hr_recruitment_processes")
    .select("id,profile_id,terms_version,status,current_step,started_at,completed_at")
    .eq("profile_id", context.profile.id)
    .eq("terms_version", RECRUITMENT_TERMS_VERSION)
    .maybeSingle();
  if (processResult.error) throw new Error("Unable to load Recruitment progress.");
  const process = processResult.data as RecruitmentProcess | null;
  if (!process) return { ...context, process: null, acceptances: [] as RecruitmentAcceptance[] };

  const acceptanceResult = await db
    .from("hr_recruitment_term_acceptances")
    .select("id,process_id,profile_id,terms_version,step_number,opened_at,accepted_at")
    .eq("process_id", process.id)
    .eq("profile_id", context.profile.id)
    .order("step_number");
  if (acceptanceResult.error) throw new Error("Unable to load Recruitment terms progress.");
  return {
    ...context,
    process,
    acceptances: (acceptanceResult.data ?? []) as RecruitmentAcceptance[],
  };
}
