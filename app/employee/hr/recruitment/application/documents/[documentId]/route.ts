import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompletedRecruitmentTerms } from "@/lib/hr/recruitment-job-application-data";
import { RECRUITMENT_DOCUMENT_BUCKET } from "@/lib/hr/recruitment-job-application";

export async function GET(_:Request,{params}:{params:Promise<{documentId:string}>}) {
  try {
    const context=await requireCompletedRecruitmentTerms(); const {documentId}=await params; const db=createSupabaseAdminClient();
    const document=await db.from("hr_recruitment_job_documents").select("storage_path").eq("id",documentId).eq("profile_id",context.profile.id).maybeSingle();
    if(document.error||!document.data)return NextResponse.json({error:"Document not found."},{status:404});
    const signed=await db.storage.from(RECRUITMENT_DOCUMENT_BUCKET).createSignedUrl(document.data.storage_path,60,{download:true});
    if(signed.error||!signed.data)return NextResponse.json({error:"Document temporarily unavailable."},{status:503});
    const response=NextResponse.redirect(signed.data.signedUrl);response.headers.set("Cache-Control","private, no-store");return response;
  } catch { return NextResponse.json({error:"Document not found."},{status:404}); }
}
