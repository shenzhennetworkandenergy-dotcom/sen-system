import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireEmployeeRecruitmentAccess } from "@/lib/hr/recruitment-access";
import { RECRUITMENT_TERMS_VERSION } from "@/lib/hr/recruitment-terms";

export async function requireCompletedRecruitmentTerms() {
  const context = await requireEmployeeRecruitmentAccess();
  const db = createSupabaseAdminClient();
  const result = await db.from("hr_recruitment_processes").select("id,status,current_step")
    .eq("profile_id",context.profile.id).eq("terms_version",RECRUITMENT_TERMS_VERSION).maybeSingle();
  if (result.error || !result.data || result.data.status !== "terms_completed" || result.data.current_step !== 9) {
    throw new Error("Complete all 9 Recruitment Terms before starting the Job Application.");
  }
  return { ...context, process: result.data as { id: string; status: string; current_step: number } };
}

export async function getRecruitmentJobApplication() {
  const context = await requireCompletedRecruitmentTerms();
  const db = createSupabaseAdminClient();
  const applicationResult = await db.from("hr_recruitment_job_applications").select("*").eq("profile_id",context.profile.id).maybeSingle();
  if (applicationResult.error) throw new Error("Unable to load the Job Application.");
  const application = applicationResult.data;
  if (!application) return { ...context, application: null, education: [], experience: [], qualifications: [], skills: [], documents: [] };
  const [education,experience,qualifications,skills,documents] = await Promise.all([
    db.from("hr_recruitment_job_education").select("*").eq("application_id",application.id).eq("profile_id",context.profile.id).order("sort_order"),
    db.from("hr_recruitment_job_experience").select("*").eq("application_id",application.id).eq("profile_id",context.profile.id).order("sort_order"),
    db.from("hr_recruitment_job_qualifications").select("*").eq("application_id",application.id).eq("profile_id",context.profile.id).order("sort_order"),
    db.from("hr_recruitment_job_skills").select("*").eq("application_id",application.id).eq("profile_id",context.profile.id).order("sort_order"),
    db.from("hr_recruitment_job_documents").select("id,document_type,related_record_id,title,original_name,mime_type,size_bytes,created_at").eq("application_id",application.id).eq("profile_id",context.profile.id).order("created_at"),
  ]);
  if ([education,experience,qualifications,skills,documents].some((result) => result.error)) throw new Error("Unable to load the complete Job Application.");
  return { ...context, application, education:education.data??[], experience:experience.data??[], qualifications:qualifications.data??[], skills:skills.data??[], documents:documents.data??[] };
}
