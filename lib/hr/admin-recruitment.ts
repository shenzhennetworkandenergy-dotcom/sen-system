import "server-only";

import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const ADMIN_RECRUITMENT_PERMISSION = "hr.manage_recruitment";
export const ADMIN_RECRUITMENT_PAGE_SIZE = 25;

export type AdminRecruitmentFilters = { query?: string; position?: string; from?: string; to?: string; page?: number };

export function normalizeAdminRecruitmentSearch(value?: string) {
  return (value ?? "").trim().replace(/[^\p{L}\p{N}\s@.+\-]/gu, "").slice(0, 100);
}

export function adminRecruitmentDocumentHref(documentId: string, download = false) {
  return `/admin/hr/recruitment/documents/${encodeURIComponent(documentId)}${download ? "?download=1" : ""}`;
}

export async function requireAdminRecruitmentAccess() {
  return requirePermission(ADMIN_RECRUITMENT_PERMISSION);
}

export async function getSubmittedRecruitmentApplications(filters: AdminRecruitmentFilters) {
  await requireAdminRecruitmentAccess();
  const db = createSupabaseAdminClient();
  const page = Math.max(1, Number(filters.page) || 1);
  const offset = (page - 1) * ADMIN_RECRUITMENT_PAGE_SIZE;
  let query = db.from("hr_recruitment_job_applications")
    .select("id,application_number,full_name,position_applied_for,phone,status,submitted_at", { count: "exact" })
    .eq("status", "SUBMITTED")
    .order("submitted_at", { ascending: false })
    .range(offset, offset + ADMIN_RECRUITMENT_PAGE_SIZE - 1);
  const search = normalizeAdminRecruitmentSearch(filters.query);
  const position = normalizeAdminRecruitmentSearch(filters.position);
  if (search) query = query.or(`application_number.ilike.%${search}%,full_name.ilike.%${search}%,phone.ilike.%${search}%,position_applied_for.ilike.%${search}%`);
  if (position) query = query.ilike("position_applied_for", `%${position}%`);
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) query = query.gte("submitted_at", `${filters.from}T00:00:00.000Z`);
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) query = query.lte("submitted_at", `${filters.to}T23:59:59.999Z`);
  const result = await query;
  if (result.error) throw new Error("Unable to load submitted Recruitment applications.");
  return { rows: result.data ?? [], count: result.count ?? 0, page, pageSize: ADMIN_RECRUITMENT_PAGE_SIZE };
}

export async function getSubmittedRecruitmentApplication(applicationId: string) {
  await requireAdminRecruitmentAccess();
  const db = createSupabaseAdminClient();
  const application = await db.from("hr_recruitment_job_applications").select("*").eq("id", applicationId).eq("status", "SUBMITTED").maybeSingle();
  if (application.error) throw new Error("Unable to load the Recruitment application.");
  if (!application.data) return null;
  const [education, experience, qualifications, skills, documents] = await Promise.all([
    db.from("hr_recruitment_job_education").select("*").eq("application_id", applicationId).order("sort_order"),
    db.from("hr_recruitment_job_experience").select("*").eq("application_id", applicationId).order("sort_order"),
    db.from("hr_recruitment_job_qualifications").select("*").eq("application_id", applicationId).order("sort_order"),
    db.from("hr_recruitment_job_skills").select("*").eq("application_id", applicationId).order("sort_order"),
    db.from("hr_recruitment_job_documents").select("id,document_type,related_record_id,title,original_name,mime_type,size_bytes,created_at").eq("application_id", applicationId).order("created_at"),
  ]);
  if ([education, experience, qualifications, skills, documents].some((item) => item.error)) throw new Error("Unable to load the complete Recruitment application.");
  return { application: application.data, education: education.data ?? [], experience: experience.data ?? [], qualifications: qualifications.data ?? [], skills: skills.data ?? [], documents: documents.data ?? [] };
}

export async function getAdminRecruitmentDocument(documentId: string) {
  await requireAdminRecruitmentAccess();
  const result = await createSupabaseAdminClient().from("hr_recruitment_job_documents")
    .select("id,application_id,storage_path,original_name,mime_type,hr_recruitment_job_applications!inner(status)")
    .eq("id", documentId).eq("hr_recruitment_job_applications.status", "SUBMITTED").maybeSingle();
  return result.error || !result.data ? null : result.data;
}
